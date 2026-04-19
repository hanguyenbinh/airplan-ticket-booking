import { Controller, Get, Logger, Param } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SeatLockerService } from './seat-locker.service';
import { KafkaProducer } from '../clients/kafka.client';

@Controller()
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  constructor(
    private readonly locker: SeatLockerService,
    private readonly kafka: KafkaProducer,
  ) {}

  // ─── HTTP ─────────────────────────────────────────────────────────

  @Get('health')
  health() {
    return { status: 'ok', service: 'inventory-service' };
  }

  @Get('flights/:flightId/seats')
  getSeats(@Param('flightId') flightId: string) {
    return this.locker.getFlightSeats(flightId);
  }

  @Get('flights/:flightId/seats/:seatNo')
  getSeat(@Param('flightId') flightId: string, @Param('seatNo') seatNo: string) {
    return this.locker.getSeat(flightId, seatNo);
  }

  // ─── Kafka Events ──────────────────────────────────────────────────

  @EventPattern('seat.lock')
  async onLock(
    @Payload()
    data: { bookingId: string; flightId: string; seatNo: string; ttlSeconds?: number },
  ) {
    this.logger.log(`seat.lock received: booking=${data.bookingId}`);
    const result = await this.locker.lock(
      data.bookingId,
      data.flightId,
      data.seatNo,
      data.ttlSeconds,
    );

    if (result.success) {
      this.kafka.emit('seat.locked', {
        bookingId: data.bookingId,
        lockToken: result.lockToken,
      });
      // Thông báo cho search-service cập nhật availability
      this.kafka.emit('inventory.changed', {
        flightId: data.flightId,
        seatNo: data.seatNo,
        available: false,
      });
    } else {
      this.kafka.emit('seat.lock.failed', {
        bookingId: data.bookingId,
        reason: result.reason,
      });
    }
  }

  @EventPattern('seat.release')
  async onRelease(
    @Payload() data: { bookingId: string; flightId: string; seatNo: string; lockToken: string },
  ) {
    this.logger.log(`seat.release received: booking=${data.bookingId}`);
    await this.locker.release(data.flightId, data.seatNo, data.lockToken);

    this.kafka.emit('inventory.changed', {
      flightId: data.flightId,
      seatNo: data.seatNo,
      available: true,
    });
  }

  @EventPattern('seat.confirm')
  async onConfirm(
    @Payload() data: { bookingId: string; flightId: string; seatNo: string; lockToken: string },
  ) {
    this.logger.log(`seat.confirm received: booking=${data.bookingId}`);
    const ok = await this.locker.confirm(data.flightId, data.seatNo, data.lockToken);

    if (ok) {
      this.kafka.emit('seat.confirmed', { bookingId: data.bookingId });
    } else {
      this.kafka.emit('seat.confirm.failed', {
        bookingId: data.bookingId,
        reason: 'Optimistic lock conflict or token mismatch',
      });
    }
  }

  // ─── Cron Jobs ────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpiredLocks() {
    await this.locker.releaseExpiredSeats();
  }
}
