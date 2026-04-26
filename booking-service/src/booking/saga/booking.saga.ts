import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from '../entities/booking.entity';
import { KafkaProducer } from 'kafka-rdkafka';
import { AvailableSeatsCacheService } from '../available-seats-cache.service';

/**
 * Orchestration Saga — booking-service điều phối toàn bộ flow.
 *
 * Flow:
 *   1. BookingService.create  → emit seat.lock          → inventory-service
 *   2. (seat.locked event)    → onSeatLocked → mock pay → onPaymentCompleted
 *   3. onPaymentCompleted     → emit seat.confirm        → inventory-service
 *   4. (seat.confirmed event) → onSeatConfirmed → CONFIRMED + booking.confirmed
 *   Nếu bất kỳ bước nào fail → compensate()
 *
 * Tối ưu hóa Postgres:
 *   - Mỗi step là MỘT update (không SELECT trước) dùng jsonb || để merge sagaState.
 *   - WHERE status IN (...) làm UPDATE idempotent — replay event = no-op.
 *   - RETURNING trả các field cần cho step kế tiếp (flightId, seatNo, lockToken…)
 *     trong cùng 1 round-trip.
 */
@Injectable()
export class BookingSaga {
  private readonly logger = new Logger(BookingSaga.name);
  /**
   * Mock payment delay; default 0 (setImmediate). Set PAYMENT_MOCK_DELAY_MS=100
   * to simulate a slow payment provider. 0 removes a 100ms latency floor and avoids
   * keeping thousands of live timers under stress.
   */
  private readonly paymentMockDelayMs = Math.max(
    0,
    Number(process.env.PAYMENT_MOCK_DELAY_MS ?? 0),
  );

  constructor(
    @InjectRepository(Booking) private readonly repo: Repository<Booking>,
    private readonly kafka: KafkaProducer,
    private readonly seatsCache: AvailableSeatsCacheService,
  ) {}

  /** Step 2: seat đã lock → tiến hành (mock) thanh toán */
  async onSeatLocked(bookingId: string, lockToken: string): Promise<void> {
    const updated = await this.mergeSagaUpdate(
      bookingId,
      { step: 'CHARGING_PAYMENT', lockToken },
      'SEAT_LOCKED',
      ['INITIATED'],
      true,
    );
    if (!updated) {
      this.logger.warn(`[${bookingId}] onSeatLocked: no row updated (already advanced?)`);
      return;
    }
    const lockRoundTripMs = this.computeLockRoundTripMs(updated.sagaState?.lockRequestedAt);
    if (lockRoundTripMs !== undefined) {
      this.logger.log(`[${bookingId}] seat.lock → seat.locked: ${lockRoundTripMs}ms`);
      await this.repo
        .createQueryBuilder()
        .update(Booking)
        .set({
          sagaState: () =>
            `coalesce("sagaState", '{}'::jsonb) || ${this.jsonbLiteral({ lockRoundTripMs })}`,
        })
        .where('id = :id', { id: bookingId })
        .execute();
    }

    const fireOnPaymentDone = () => {
      void this.onPaymentCompleted(bookingId, `pay_${Date.now()}`);
    };
    if (this.paymentMockDelayMs > 0) {
      setTimeout(fireOnPaymentDone, this.paymentMockDelayMs);
    } else {
      setImmediate(fireOnPaymentDone);
    }
  }

  /** Step 3: payment xong → confirm seat */
  async onPaymentCompleted(bookingId: string, paymentId: string): Promise<void> {
    const updated = await this.mergeSagaUpdate(
      bookingId,
      { step: 'CONFIRMING_SEAT', paymentId },
      'PAYMENT_PROCESSING',
      ['SEAT_LOCKED'],
      true,
    );
    if (!updated) {
      this.logger.warn(`[${bookingId}] onPaymentCompleted: no row updated`);
      return;
    }
    this.kafka.emit('seat.confirm', {
      bookingId,
      flightId: updated.flightId,
      seatNo: updated.seatNo,
      lockToken: updated.sagaState?.lockToken,
    });
  }

  /** Step 4: ghế confirmed → booking xong */
  async onSeatConfirmed(bookingId: string): Promise<void> {
    const updated = await this.mergeSagaUpdate(
      bookingId,
      { step: 'DONE' },
      'CONFIRMED',
      ['PAYMENT_PROCESSING'],
      true,
    );
    if (!updated) {
      this.logger.warn(`[${bookingId}] onSeatConfirmed: no row updated`);
      return;
    }
    this.kafka.emit('booking.confirmed', {
      bookingId,
      passengerName: updated.passengerName,
      flightId: updated.flightId,
      seatNo: updated.seatNo,
      totalAmount: updated.totalAmount,
    });
  }

  /** Compensate: hoàn tác mọi thứ khi có lỗi */
  async compensate(bookingId: string, reason: string): Promise<void> {
    this.logger.error(`[${bookingId}] COMPENSATING — reason: ${reason}`);

    const updated = await this.mergeSagaUpdate(
      bookingId,
      { step: 'COMPENSATED', error: reason },
      'FAILED',
      ['INITIATED', 'SEAT_LOCKED', 'PAYMENT_PROCESSING'],
      true,
    );
    if (!updated) {
      this.logger.warn(`[${bookingId}] compensate: no row updated`);
      return;
    }

    const lockRoundTripMs = this.computeLockRoundTripMs(updated.sagaState?.lockRequestedAt);
    if (lockRoundTripMs !== undefined) {
      const label = reason.includes('Seat lock failed') ? 'seat.lock.failed' : 'compensate';
      this.logger.log(`[${bookingId}] seat.lock → ${label}: ${lockRoundTripMs}ms`);
    }

    if (updated.sagaState?.lockToken) {
      this.kafka.emit('seat.release', {
        bookingId,
        flightId: updated.flightId,
        seatNo: updated.seatNo,
        lockToken: updated.sagaState.lockToken,
      });
    }

    await this.seatsCache.unreserveSeatInCache(updated.flightId, updated.seatNo);
  }

  /**
   * Single conditional UPDATE that:
   *   - merges `patch` into `sagaState` server-side via jsonb concat
   *   - sets `status` if provided
   *   - guards by `allowedFromStatuses` so replays of the same Kafka event no-op
   *   - returns row data (id, flightId, seatNo, passengerName, totalAmount, sagaState)
   *     so the caller doesn't need a separate SELECT.
   */
  private async mergeSagaUpdate(
    bookingId: string,
    sagaPatch: Record<string, unknown>,
    nextStatus: Booking['status'],
    allowedFromStatuses: Booking['status'][],
    needRow: boolean,
  ): Promise<Booking | null> {
    const qb = this.repo
      .createQueryBuilder()
      .update(Booking)
      .set({
        status: nextStatus,
        sagaState: () =>
          `coalesce("sagaState", '{}'::jsonb) || ${this.jsonbLiteral(sagaPatch)}`,
      })
      .where('id = :id AND status IN (:...allowed)', {
        id: bookingId,
        allowed: allowedFromStatuses,
      });

    if (needRow) {
      qb.returning(['id', 'flightId', 'seatNo', 'passengerName', 'totalAmount', 'status', 'sagaState']);
    }
    const r = await qb.execute();
    if (!r.affected) return null;
    if (!needRow) return null;
    const row = Array.isArray(r.raw) && r.raw.length > 0 ? r.raw[0] : null;
    return row as Booking | null;
  }

  /**
   * Inline a JS object as a Postgres jsonb literal.
   * Safe for our payloads (lockToken is a UUID, paymentId is `pay_<ms>`, error is a short string),
   * but we still escape single quotes to keep the SQL well-formed.
   */
  private jsonbLiteral(obj: Record<string, unknown>): string {
    const json = JSON.stringify(obj).replace(/'/g, "''");
    return `'${json}'::jsonb`;
  }

  private computeLockRoundTripMs(lockRequestedAt: string | undefined): number | undefined {
    if (!lockRequestedAt) return undefined;
    const ms = Date.now() - Date.parse(lockRequestedAt);
    if (!Number.isFinite(ms) || ms < 0) return undefined;
    return Math.round(ms);
  }
}
