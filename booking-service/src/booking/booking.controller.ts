import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
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
}
