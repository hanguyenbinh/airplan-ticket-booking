import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Seat } from './entities/seat.entity';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';

const LOCK_TTL_SECONDS = 600; // 10 phút

/**
 * Lua script: atomic release — chỉ xóa nếu lockToken khớp
 * Tránh race condition: thread A không xóa lock của thread B
 */
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

@Injectable()
export class SeatLockerService implements OnModuleDestroy {
  private readonly logger = new Logger(SeatLockerService.name);
  private readonly redis: Redis;

  constructor(
    @InjectRepository(Seat) private readonly seatRepo: Repository<Seat>,
    private readonly dataSource: DataSource,
  ) {
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }

  /**
   * Lock ghế:
   * 1. Redis SETNX atomic → đảm bảo chỉ 1 request thắng
   * 2. Update DB status = LOCKED
   */
  async lock(
    bookingId: string,
    flightId: string,
    seatNo: string,
    ttlSeconds = LOCK_TTL_SECONDS,
  ): Promise<{ success: boolean; lockToken?: string; reason?: string }> {
    const redisKey = `seat:lock:${flightId}:${seatNo}`;
    const lockToken = randomUUID();

    // Atomic SET if not exists
    const result = await this.redis.set(redisKey, lockToken, 'EX', ttlSeconds, 'NX');

    if (result !== 'OK') {
      this.logger.warn(`Seat ${flightId}/${seatNo} already locked`);
      return { success: false, reason: 'Seat already locked or booked' };
    }

    try {
      // Tìm hoặc tạo seat record
      let seat = await this.seatRepo.findOneBy({ flightId, seatNo });
      if (!seat) {
        seat = this.seatRepo.create({ flightId, seatNo, status: 'AVAILABLE' });
      }

      if (seat.status === 'BOOKED') {
        // Ghế đã bán vĩnh viễn → release Redis lock ngay
        await this.redis.eval(RELEASE_SCRIPT, 1, redisKey, lockToken);
        return { success: false, reason: 'Seat already booked' };
      }

      seat.status = 'LOCKED';
      seat.lockToken = lockToken;
      seat.lockedByBookingId = bookingId;
      seat.lockExpiresAt = new Date(Date.now() + ttlSeconds * 1000);
      await this.seatRepo.save(seat);

      this.logger.log(`Seat ${flightId}/${seatNo} locked for booking ${bookingId}`);
      return { success: true, lockToken };
    } catch (err) {
      // Rollback Redis lock nếu DB fail
      await this.redis.eval(RELEASE_SCRIPT, 1, redisKey, lockToken);
      throw err;
    }
  }

  /**
   * Release lock (dùng khi saga compensate)
   */
  async release(flightId: string, seatNo: string, lockToken: string): Promise<void> {
    const redisKey = `seat:lock:${flightId}:${seatNo}`;
    await this.redis.eval(RELEASE_SCRIPT, 1, redisKey, lockToken);

    await this.seatRepo.update(
      { flightId, seatNo, lockToken },
      { status: 'AVAILABLE', lockToken: null, lockedByBookingId: null, lockExpiresAt: null },
    );

    this.logger.log(`Seat ${flightId}/${seatNo} released`);
  }

  /**
   * Confirm lock → BOOKED vĩnh viễn (dùng Optimistic Locking)
   */
  async confirm(flightId: string, seatNo: string, lockToken: string): Promise<boolean> {
    const seat = await this.seatRepo.findOneBy({ flightId, seatNo, lockToken });
    if (!seat) {
      this.logger.error(`Seat ${flightId}/${seatNo} not found or token mismatch`);
      return false;
    }

    try {
      // TypeORM optimistic lock — throw OptimisticLockVersionMismatchError nếu version thay đổi
      await this.dataSource.transaction(async (manager) => {
        await manager.save(Seat, {
          ...seat,
          status: 'BOOKED',
          lockToken: null,
          lockedByBookingId: null,
          lockExpiresAt: null,
        });
      });

      // Xóa Redis lock
      const redisKey = `seat:lock:${flightId}:${seatNo}`;
      await this.redis.del(redisKey);

      this.logger.log(`Seat ${flightId}/${seatNo} confirmed as BOOKED`);
      return true;
    } catch (err) {
      this.logger.error(`Optimistic lock conflict for ${flightId}/${seatNo}: ${err}`);
      return false;
    }
  }

  /** Cron job: auto-release ghế hết TTL nhưng chưa được release */
  async releaseExpiredSeats(): Promise<Array<{ flightId: string; seatNo: string }>> {
    const expired = await this.seatRepo
      .createQueryBuilder('seat')
      .where('seat.status = :status', { status: 'LOCKED' })
      .andWhere('seat.lockExpiresAt < NOW()')
      .getMany();

    for (const seat of expired) {
      this.logger.warn(`Auto-releasing expired seat ${seat.flightId}/${seat.seatNo}`);
      await this.seatRepo.update(seat.id, {
        status: 'AVAILABLE',
        lockToken: null,
        lockedByBookingId: null,
        lockExpiresAt: null,
      });
    }
    return expired.map((s) => ({ flightId: s.flightId, seatNo: s.seatNo }));
  }

  /** Admin / seed: add an AVAILABLE row (idempotent if same seat exists). */
  async addAvailableSeat(
    flightId: string,
    seatNo: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const existing = await this.seatRepo.findOneBy({ flightId, seatNo });
    if (existing) {
      if (existing.status === 'AVAILABLE') return { ok: true };
      return { ok: false, reason: `Seat exists with status ${existing.status}` };
    }
    await this.seatRepo.save(this.seatRepo.create({ flightId, seatNo, status: 'AVAILABLE' }));
    return { ok: true };
  }

  /** Remove seat row only when AVAILABLE (not LOCKED / BOOKED). */
  async removeSeat(
    flightId: string,
    seatNo: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const existing = await this.seatRepo.findOneBy({ flightId, seatNo });
    if (!existing) return { ok: false, reason: 'Seat not found' };
    if (existing.status !== 'AVAILABLE') {
      return { ok: false, reason: `Cannot remove seat in status ${existing.status}` };
    }
    await this.seatRepo.delete({ id: existing.id });
    return { ok: true };
  }

  async getSeat(flightId: string, seatNo: string): Promise<Seat | null> {
    return this.seatRepo.findOneBy({ flightId, seatNo });
  }

  async getFlightSeats(flightId: string): Promise<Seat[]> {
    return this.seatRepo.findBy({ flightId });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
