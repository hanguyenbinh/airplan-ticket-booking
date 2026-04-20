import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { BookingService } from './booking.service';
import { BookingSaga } from './saga/booking.saga';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AvailableSeatsCacheService } from './available-seats-cache.service';

@Controller()
export class BookingController {
  constructor(
    private readonly bookingService: BookingService,
    private readonly saga: BookingSaga,
    private readonly seatsCache: AvailableSeatsCacheService,
  ) {}

  // ─── HTTP Endpoints ────────────────────────────────────────────────

  @Get('health')
  health() {
    return { status: 'ok', service: 'booking-service' };
  }

  @Post('bookings')
  @HttpCode(HttpStatus.ACCEPTED)
  create(@Body() dto: CreateBookingDto) {
    return this.bookingService.create(dto);
  }

  @Get('bookings')
  findAll() {
    return this.bookingService.findAll();
  }

  @Get('bookings/:id')
  findOne(@Param('id') id: string) {
    return this.bookingService.findOne(id);
  }

  // ─── Kafka Event Handlers ──────────────────────────────────────────

  @EventPattern('seat.locked')
  async onSeatLocked(@Payload() data: { bookingId: string; lockToken: string }) {
    await this.saga.onSeatLocked(data.bookingId, data.lockToken);
  }

  @EventPattern('seat.lock.failed')
  async onSeatLockFailed(@Payload() data: { bookingId: string; reason: string }) {
    await this.saga.compensate(data.bookingId, `Seat lock failed: ${data.reason}`);
  }

  @EventPattern('seat.confirmed')
  async onSeatConfirmed(@Payload() data: { bookingId: string }) {
    await this.saga.onSeatConfirmed(data.bookingId);
  }

  @EventPattern('inventory.available.init')
  async onInventoryAvailableInit(
    @Payload() data: { snapshots?: { flightId: string; seatNos?: string[] }[] },
  ) {
    const snapshots = Array.isArray(data?.snapshots) ? data.snapshots : [];
    await this.seatsCache.replaceAllFromInventoryInit(snapshots);
  }

  @EventPattern('inventory.changed')
  async onInventoryChanged(@Payload() data: { flightId: string; seatNo: string; available: boolean }) {
    if (data?.flightId && data?.seatNo != null) {
      await this.seatsCache.applyAvailability(data.flightId, data.seatNo, Boolean(data.available));
    }
  }
}
