import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotificationKafkaHandlerService {
  private readonly logger = new Logger(NotificationKafkaHandlerService.name);

  dispatch(topic: string, payload: any) {
    if (topic === 'booking.confirmed') {
      this.logger.log(`
╔══════════════════════════════════════════
║  ✅ BOOKING CONFIRMED
║  Booking ID  : ${payload.bookingId}
║  Passenger   : ${payload.passengerName}
║  Flight      : ${payload.flightId}
║  Seat        : ${payload.seatNo}
║  Amount      : ${Number(payload.totalAmount).toLocaleString('vi-VN')} VND
╚══════════════════════════════════════════
    `);
      return;
    }

    if (topic === 'booking.failed') {
      this.logger.warn(`
╔══════════════════════════════════════════
║  ❌ BOOKING FAILED
║  Booking ID : ${payload.bookingId}
║  Reason     : ${payload.reason}
╚══════════════════════════════════════════
    `);
    }
  }
}

