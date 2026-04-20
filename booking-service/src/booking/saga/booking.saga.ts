import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from '../entities/booking.entity';
import { KafkaProducer } from '../../clients/kafka.client';
import { AvailableSeatsCacheService } from '../available-seats-cache.service';

/**
 * Orchestration Saga — booking-service điều phối toàn bộ flow.
 *
 * Flow:
 *   1. lockSeat        → emit seat.lock       → inventory-service
 *   2. (nhận seat.locked event) → chargePayment
 *   3. chargePayment   → emit payment.charge   → payment-service (mock)
 *   4. (nhận payment.completed) → confirmSeat
 *   5. confirmSeat     → emit seat.confirm     → inventory-service
 *   6. done → CONFIRMED
 *
 *   Nếu bất kỳ bước nào fail → compensate()
 */
@Injectable()
export class BookingSaga {
  private readonly logger = new Logger(BookingSaga.name);

  constructor(
    @InjectRepository(Booking) private readonly repo: Repository<Booking>,
    private readonly kafka: KafkaProducer,
    private readonly seatsCache: AvailableSeatsCacheService,
  ) {}

  /** Khởi động saga — gọi ngay sau khi tạo booking record */
  async start(booking: Booking): Promise<void> {
    await this.lockSeat(booking);
  }

  /** Step 1: Yêu cầu inventory-service khóa ghế */
  private async lockSeat(booking: Booking): Promise<void> {
    this.logger.log(`[${booking.id}] STEP 1 — locking seat ${booking.seatNo}`);

    await this.updateSaga(booking, {
      ...booking.sagaState,
      step: 'LOCKING_SEAT',
      lockRequestedAt: new Date().toISOString(),
    });

    this.kafka.emit('seat.lock', {
      bookingId: booking.id,
      flightId: booking.flightId,
      seatNo: booking.seatNo,
      ttlSeconds: 600, // 10 phút để user thanh toán
    });
  }

  /** Step 2: Nhận kết quả lock → xử lý thanh toán (mock) */
  async onSeatLocked(bookingId: string, lockToken: string): Promise<void> {
    this.logger.log(`[${bookingId}] STEP 2 — seat locked, processing payment`);

    const booking = await this.repo.findOneByOrFail({ id: bookingId });
    const lockRoundTripMs = this.computeLockRoundTripMs(booking);
    if (lockRoundTripMs !== undefined) {
      this.logger.log(`[${bookingId}] seat.lock → seat.locked: ${lockRoundTripMs}ms`);
    }
    await this.updateSaga(booking, {
      ...booking.sagaState,
      step: 'CHARGING_PAYMENT',
      lockToken,
      lockRequestedAt: booking.sagaState?.lockRequestedAt,
      lockRoundTripMs,
    });
    await this.repo.update(bookingId, { status: 'SEAT_LOCKED' });

    // Trong thực tế: gọi payment-service qua Kafka
    // Ở đây mock thành công sau 100ms
    setTimeout(() => this.onPaymentCompleted(bookingId, `pay_${Date.now()}`), 100);
  }

  /** Step 3: Thanh toán thành công → xác nhận ghế vĩnh viễn */
  async onPaymentCompleted(bookingId: string, paymentId: string): Promise<void> {
    this.logger.log(`[${bookingId}] STEP 3 — payment done, confirming seat`);

    const booking = await this.repo.findOneByOrFail({ id: bookingId });
    await this.updateSaga(booking, { ...booking.sagaState, step: 'CONFIRMING_SEAT', paymentId });
    await this.repo.update(bookingId, { status: 'PAYMENT_PROCESSING' });

    this.kafka.emit('seat.confirm', {
      bookingId,
      flightId: booking.flightId,
      seatNo: booking.seatNo,
      lockToken: booking.sagaState?.lockToken,
    });
  }

  /** Step 4: Ghế đã confirm → booking hoàn tất */
  async onSeatConfirmed(bookingId: string): Promise<void> {
    this.logger.log(`[${bookingId}] DONE — booking confirmed`);

    const booking = await this.repo.findOneByOrFail({ id: bookingId });
    await this.repo.update(bookingId, {
      status: 'CONFIRMED',
      sagaState: { ...booking.sagaState, step: 'DONE' },
    });

    // Thông báo cho user (notification-service sẽ lắng nghe event này)
    this.kafka.emit('booking.confirmed', {
      bookingId,
      passengerName: booking.passengerName,
      flightId: booking.flightId,
      seatNo: booking.seatNo,
      totalAmount: booking.totalAmount,
    });
  }

  /** Compensate: hoàn tác mọi thứ khi có lỗi */
  async compensate(bookingId: string, reason: string): Promise<void> {
    this.logger.error(`[${bookingId}] COMPENSATING — reason: ${reason}`);

    const booking = await this.repo.findOneByOrFail({ id: bookingId });
    const lockRoundTripMs = this.computeLockRoundTripMs(booking);
    if (lockRoundTripMs !== undefined) {
      const label = reason.includes('Seat lock failed') ? 'seat.lock.failed' : 'compensate';
      this.logger.log(`[${bookingId}] seat.lock → ${label}: ${lockRoundTripMs}ms`);
    }

    // Nếu ghế đã được khóa → phải release
    if (booking.sagaState?.lockToken) {
      this.kafka.emit('seat.release', {
        bookingId,
        flightId: booking.flightId,
        seatNo: booking.seatNo,
        lockToken: booking.sagaState.lockToken,
      });
    }

    await this.repo.update(bookingId, {
      status: 'FAILED',
      sagaState: {
        step: 'COMPENSATED',
        error: reason,
        ...(lockRoundTripMs !== undefined ? { lockRoundTripMs } : {}),
      },
    });

    // Restore seat in local cache (covers lock-failed before token; idempotent if inventory.changed also fires)
    await this.seatsCache.unreserveSeatInCache(booking.flightId, booking.seatNo);
  }

  /** ms from `lockRequestedAt` (emit `seat.lock`) to now; undefined if not tracked. */
  private computeLockRoundTripMs(booking: Booking): number | undefined {
    const raw = booking.sagaState?.lockRequestedAt;
    if (!raw) return undefined;
    const ms = Date.now() - Date.parse(raw);
    if (!Number.isFinite(ms) || ms < 0) return undefined;
    return Math.round(ms);
  }

  private async updateSaga(booking: Booking, state: Booking['sagaState']): Promise<void> {
    await this.repo.update(booking.id, { sagaState: state });
  }
}
