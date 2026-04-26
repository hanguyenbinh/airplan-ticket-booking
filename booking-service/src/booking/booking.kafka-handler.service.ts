import { Injectable } from '@nestjs/common';
import { BookingSaga } from './saga/booking.saga';
import { AvailableSeatsCacheService } from './available-seats-cache.service';

@Injectable()
export class BookingKafkaHandlerService {
  constructor(
    private readonly saga: BookingSaga,
    private readonly seatsCache: AvailableSeatsCacheService,
  ) {}

  async dispatch(topic: string, payload: any) {
    if (topic === 'seat.locked') {
      await this.saga.onSeatLocked(payload.bookingId, payload.lockToken);
      return;
    }
    if (topic === 'seat.lock.failed') {
      await this.saga.compensate(payload.bookingId, `Seat lock failed: ${payload.reason}`);
      return;
    }
    if (topic === 'seat.confirmed') {
      await this.saga.onSeatConfirmed(payload.bookingId);
      return;
    }
    if (topic === 'inventory.available.init') {
      const snapshots = Array.isArray(payload?.snapshots) ? payload.snapshots : [];
      await this.seatsCache.replaceAllFromInventoryInit(snapshots);
      return;
    }
    if (topic === 'inventory.changed') {
      if (payload?.flightId && payload?.seatNo != null) {
        await this.seatsCache.applyAvailability(payload.flightId, payload.seatNo, Boolean(payload.available));
      }
      return;
    }
  }
}

