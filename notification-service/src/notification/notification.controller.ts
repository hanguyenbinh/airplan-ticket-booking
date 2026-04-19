import { Controller, Get, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';

@Controller()
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  @Get('health')
  health() {
    return { status: 'ok', service: 'notification-service' };
  }

  @EventPattern('booking.confirmed')
  onBookingConfirmed(
    @Payload()
    data: {
      bookingId: string;
      passengerName: string;
      flightId: string;
      seatNo: string;
      totalAmount: number;
    },
  ) {
    // Production: gọi Nodemailer, Twilio, Firebase, v.v.
    this.logger.log(`
╔══════════════════════════════════════════
║  ✅ BOOKING CONFIRMED
║  Booking ID  : ${data.bookingId}
║  Passenger   : ${data.passengerName}
║  Flight      : ${data.flightId}
║  Seat        : ${data.seatNo}
║  Amount      : ${Number(data.totalAmount).toLocaleString('vi-VN')} VND
╚══════════════════════════════════════════
    `);
  }

  @EventPattern('booking.failed')
  onBookingFailed(
    @Payload() data: { bookingId: string; passengerName?: string; reason: string },
  ) {
    this.logger.warn(`
╔══════════════════════════════════════════
║  ❌ BOOKING FAILED
║  Booking ID : ${data.bookingId}
║  Reason     : ${data.reason}
╚══════════════════════════════════════════
    `);
  }
}
