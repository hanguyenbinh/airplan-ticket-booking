import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SeatLockerService } from './seat-locker.service';
import { KafkaProducer } from '../clients/kafka.client';
import { SharedSeatAvailabilityRedisService } from './shared-seat-availability-redis.service';

@Controller()
export class InventoryController {
  private readonly logger = new Logger(InventoryController.name);

  constructor(
    private readonly locker: SeatLockerService,
    private readonly kafka: KafkaProducer,
    private readonly seatAvailRedis: SharedSeatAvailabilityRedisService,
  ) {}

  private emitInventoryChanged(flightId: string, seatNo: string, available: boolean) {
    void this.seatAvailRedis.syncSeat(flightId, seatNo, available);
    this.kafka.emit('inventory.changed', { flightId, seatNo, available });
  }

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
      this.emitInventoryChanged(data.flightId, data.seatNo, false);
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

    this.emitInventoryChanged(data.flightId, data.seatNo, true);
  }

  @EventPattern('seat.confirm')
  async onConfirm(
    @Payload() data: { bookingId: string; flightId: string; seatNo: string; lockToken: string },
  ) {
    this.logger.log(`seat.confirm received: booking=${data.bookingId}`);
    const ok = await this.locker.confirm(data.flightId, data.seatNo, data.lockToken);

    if (ok) {
      // No `inventory.changed` here: the seat was already removed from the booking-side
      // availability cache when seat.lock succeeded (see onLock above). Re-emitting on
      // confirm caused every booking pod to redo a Redis SREM that was already done.
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
    const released = await this.locker.releaseExpiredSeats();
    for (const { flightId, seatNo } of released) {
      this.emitInventoryChanged(flightId, seatNo, true);
    }
  }

  /** Admin: add an AVAILABLE seat (keeps booking cache in sync). */
  @Post('flights/:flightId/seats')
  async addSeat(@Param('flightId') flightId: string, @Body() body: { seatNo?: string }) {
    const seatNo = typeof body?.seatNo === 'string' ? body.seatNo.trim() : '';
    if (seatNo.length < 2 || seatNo.length > 10) {
      throw new BadRequestException('seatNo must be 2–10 characters');
    }
    const r = await this.locker.addAvailableSeat(flightId, seatNo);
    if (!r.ok) throw new ConflictException(r.reason);
    this.emitInventoryChanged(flightId, seatNo, true);
    return { ok: true, flightId, seatNo };
  }

  /** Admin: remove an AVAILABLE seat row. */
  @Delete('flights/:flightId/seats/:seatNo')
  async removeSeat(@Param('flightId') flightId: string, @Param('seatNo') seatNo: string) {
    const r = await this.locker.removeSeat(flightId, decodeURIComponent(seatNo));
    if (!r.ok) {
      if (r.reason === 'Seat not found') throw new NotFoundException(r.reason);
      throw new ConflictException(r.reason);
    }
    this.emitInventoryChanged(flightId, seatNo, false);
    return { ok: true, flightId, seatNo };
  }

  /**
   * Admin: reset every seat row to AVAILABLE (all flights, or one flight via query).
   * Clears Redis `seat:lock:*` keys, rewrites the shared seat availability snapshot in Redis,
   * and emits `inventory.available.init` so all booking-service pods refresh their caches.
   *
   *   POST /flights/seats/reset               → all flights
   *   POST /flights/:flightId/seats/reset     → one flight
   */
  @Post('flights/seats/reset')
  async resetAllSeats() {
    return this.resetSeatsInternal();
  }

  @Post('flights/:flightId/seats/reset')
  async resetFlightSeats(@Param('flightId') flightId: string) {
    return this.resetSeatsInternal(flightId);
  }

  private async resetSeatsInternal(flightId?: string) {
    const { updated, snapshots } = await this.locker.resetAllSeatsToAvailable(flightId);
    await this.seatAvailRedis.replaceAllFromSnapshots(snapshots);
    this.kafka.emit('inventory.available.init', { snapshots });
    this.logger.warn(
      `Reset API${flightId ? ` flight=${flightId}` : ''}: updated=${updated}, flights=${snapshots.length}`,
    );
    return {
      ok: true,
      scope: flightId ? 'flight' : 'all',
      flightId: flightId ?? null,
      updated,
      flights: snapshots.length,
    };
  }
}
