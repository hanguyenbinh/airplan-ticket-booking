import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }

  /**
   * Lock ghế (1 Redis RTT + 1 Postgres RTT trên hot path):
   *   1. Redis SETNX (atomic) — đảm bảo chỉ 1 request thắng cluster-wide.
   *   2. Conditional UPDATE WHERE status='AVAILABLE' (atomic per-row).
   *      - 1 row affected → success.
   *      - 0 rows         → seat không tồn tại HOẶC không AVAILABLE → fallback path.
   * Hot path: 2 RTT (cũ là 4: SETNX + SELECT + SELECT-by-pk + UPDATE).
   */
  async lock(
    bookingId: string,
    flightId: string,
    seatNo: string,
    ttlSeconds = LOCK_TTL_SECONDS,
  ): Promise<{ success: boolean; lockToken?: string; reason?: string }> {
    const redisKey = `seat:lock:${flightId}:${seatNo}`;
    const lockToken = randomUUID();

    const setNxResult = await this.redis.set(redisKey, lockToken, 'EX', ttlSeconds, 'NX');
    if (setNxResult !== 'OK') {
      this.logger.warn(`Seat ${flightId}/${seatNo} already locked (redis)`);
      return { success: false, reason: 'Seat already locked or booked' };
    }

    const lockExpiresAt = new Date(Date.now() + ttlSeconds * 1000);

    try {
      const r = await this.seatRepo
        .createQueryBuilder()
        .update(Seat)
        .set({
          status: 'LOCKED',
          lockToken,
          lockedByBookingId: bookingId,
          lockExpiresAt,
        })
        .where('flightId = :f AND seatNo = :s AND status = :a', {
          f: flightId,
          s: seatNo,
          a: 'AVAILABLE',
        })
        .execute();

      if (r.affected) {
        this.logger.log(`Seat ${flightId}/${seatNo} locked for booking ${bookingId}`);
        return { success: true, lockToken };
      }

      // Cold path: row missing (new seat) OR row exists but not AVAILABLE.
      const existing = await this.seatRepo.findOneBy({ flightId, seatNo });
      if (!existing) {
        try {
          await this.seatRepo.insert({
            flightId,
            seatNo,
            status: 'LOCKED',
            lockToken,
            lockedByBookingId: bookingId,
            lockExpiresAt,
          });
          this.logger.log(`Seat ${flightId}/${seatNo} created+locked for booking ${bookingId}`);
          return { success: true, lockToken };
        } catch (insertErr) {
          await this.redis.eval(RELEASE_SCRIPT, 1, redisKey, lockToken).catch(() => undefined);
          this.logger.warn(
            `Seat ${flightId}/${seatNo} insert race for ${bookingId}: ${(insertErr as Error)?.message}`,
          );
          return { success: false, reason: 'Seat already locked or booked' };
        }
      }

      await this.redis.eval(RELEASE_SCRIPT, 1, redisKey, lockToken).catch(() => undefined);
      return {
        success: false,
        reason:
          existing.status === 'BOOKED' ? 'Seat already booked' : 'Seat not available',
      };
    } catch (err) {
      await this.redis.eval(RELEASE_SCRIPT, 1, redisKey, lockToken).catch(() => undefined);
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
   * Confirm lock → BOOKED vĩnh viễn.
   * Single conditional UPDATE WHERE status='LOCKED' AND lockToken=...; atomic, 1 RTT.
   * Drops the previous SELECT + transaction(BEGIN/save/COMMIT) (was 4 RTT).
   */
  async confirm(flightId: string, seatNo: string, lockToken: string): Promise<boolean> {
    const r = await this.seatRepo
      .createQueryBuilder()
      .update(Seat)
      .set({
        status: 'BOOKED',
        lockToken: null,
        lockedByBookingId: null,
        lockExpiresAt: null,
      })
      .where('flightId = :f AND seatNo = :s AND status = :st AND lockToken = :t', {
        f: flightId,
        s: seatNo,
        st: 'LOCKED',
        t: lockToken,
      })
      .execute();

    if (!r.affected) {
      this.logger.error(`Seat ${flightId}/${seatNo} confirm failed: not LOCKED with this token`);
      return false;
    }

    await this.redis.del(`seat:lock:${flightId}:${seatNo}`).catch(() => undefined);
    this.logger.log(`Seat ${flightId}/${seatNo} confirmed as BOOKED`);
    return true;
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

  /**
   * Admin / test helper: set every seat row (optionally scoped to one flight) to AVAILABLE and wipe lock fields.
   * Also clears Redis `seat:lock:*` keys so the next lock requests succeed immediately.
   * Returns the fresh AVAILABLE snapshot grouped by flight.
   */
  async resetAllSeatsToAvailable(
    flightId?: string,
  ): Promise<{ updated: number; snapshots: { flightId: string; seatNos: string[] }[] }> {
    const qb = this.seatRepo
      .createQueryBuilder()
      .update(Seat)
      .set({
        status: 'AVAILABLE',
        lockToken: null,
        lockedByBookingId: null,
        lockExpiresAt: null,
      });
    if (flightId) qb.where('flightId = :flightId', { flightId });
    const res = await qb.execute();
    const updated = Number(res.affected ?? 0);

    await this.deleteRedisLockKeys(flightId);

    const rows = flightId
      ? await this.seatRepo.findBy({ flightId, status: 'AVAILABLE' })
      : await this.seatRepo.find({ where: { status: 'AVAILABLE' } });
    const byFlight = new Map<string, string[]>();
    for (const r of rows) {
      const arr = byFlight.get(r.flightId) ?? [];
      arr.push(r.seatNo);
      byFlight.set(r.flightId, arr);
    }
    const snapshots = [...byFlight.entries()].map(([fid, seatNos]) => ({ flightId: fid, seatNos }));

    this.logger.warn(
      `Reset seats${flightId ? ` for flight=${flightId}` : ''}: updated=${updated}, flights=${snapshots.length}`,
    );
    return { updated, snapshots };
  }

  /** Uses SCAN instead of KEYS so a large Redis does not block. */
  private async deleteRedisLockKeys(flightId?: string): Promise<void> {
    const match = flightId ? `seat:lock:${flightId}:*` : 'seat:lock:*';
    const stream = this.redis.scanStream({ match, count: 500 });
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (keys: string[]) => {
        if (keys.length === 0) return;
        stream.pause();
        this.redis
          .del(...keys)
          .then(() => stream.resume())
          .catch(reject);
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
