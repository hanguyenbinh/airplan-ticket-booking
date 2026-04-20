import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from './entities/booking.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AvailableSeatsCacheService } from './available-seats-cache.service';
import { KafkaProducer } from '../clients/kafka.client';

const LOCK_TTL_SECONDS = 600;

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  /**
   * Per-pod in-flight dedupe keyed by `flightId:seatNo`.
   * Under high contention (e.g. 5000 concurrent for ~150 seats), this rejects duplicate
   * attempts BEFORE they touch Redis, Postgres or Kafka — eliminating the cache
   * thrash loop that produced ~85k wasted seat.lock attempts vs ~100 actual locks.
   */
  private readonly inflight = new Map<string, Promise<Booking>>();

  constructor(
    @InjectRepository(Booking) private readonly repo: Repository<Booking>,
    private readonly seatsCache: AvailableSeatsCacheService,
    private readonly kafka: KafkaProducer,
  ) {}

  create(dto: CreateBookingDto): Promise<Booking> {
    const key = `${dto.flightId}:${dto.seatNo}`;
    if (this.inflight.has(key)) {
      throw new ConflictException(
        `Seat ${dto.seatNo} is currently being booked, please retry`,
      );
    }
    const p = this.doCreate(dto);
    this.inflight.set(key, p);
    // p.finally(...) returns a NEW promise that rejects when p rejects; if we don't
    // attach a catch to it, Node logs an unhandledRejection. Use then(_, _) instead.
    const cleanup = () => this.inflight.delete(key);
    p.then(cleanup, cleanup);
    return p;
  }

  private async doCreate(dto: CreateBookingDto): Promise<Booking> {
    if (!(await this.seatsCache.tryReserveSeatInCache(dto.flightId, dto.seatNo))) {
      throw new ConflictException(
        `Seat ${dto.seatNo} is locked in cache or not available for this flight`,
      );
    }

    // Build the LOCKING_SEAT saga state into the initial INSERT — saves one
    // follow-up UPDATE that the previous saga.start() used to do.
    const lockRequestedAt = new Date().toISOString();
    const booking = this.repo.create({
      ...dto,
      status: 'INITIATED',
      sagaState: { step: 'LOCKING_SEAT', lockRequestedAt },
    });
    try {
      await this.repo.save(booking);
    } catch (e) {
      await this.seatsCache.unreserveSeatInCache(dto.flightId, dto.seatNo);
      throw e;
    }

    // Emit Kafka inline so the request never returns 202 without a queued lock request.
    try {
      this.kafka.emit('seat.lock', {
        bookingId: booking.id,
        flightId: booking.flightId,
        seatNo: booking.seatNo,
        ttlSeconds: LOCK_TTL_SECONDS,
      });
    } catch (e) {
      this.logger.error(`kafka.emit seat.lock failed for ${booking.id}: ${(e as Error)?.message}`);
      await this.seatsCache.unreserveSeatInCache(booking.flightId, booking.seatNo);
      throw e;
    }

    return booking;
  }

  async findOne(id: string): Promise<Booking> {
    const booking = await this.repo.findOneBy({ id });
    if (!booking) throw new NotFoundException(`Booking ${id} not found`);
    return booking;
  }

  async findAll(): Promise<Booking[]> {
    return this.repo.find({ order: { createdAt: 'DESC' }, take: 50 });
  }
}
