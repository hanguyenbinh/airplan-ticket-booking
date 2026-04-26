import { Injectable, Logger } from '@nestjs/common';
import { KafkaProducer } from 'kafka-rdkafka';
import { SeatLockerService } from './seat-locker.service';
import { SharedSeatAvailabilityRedisService } from './shared-seat-availability-redis.service';

@Injectable()
export class InventoryKafkaHandlerService {
  private readonly logger = new Logger(InventoryKafkaHandlerService.name);

  constructor(
    private readonly locker: SeatLockerService,
    private readonly kafka: KafkaProducer,
    private readonly seatAvailRedis: SharedSeatAvailabilityRedisService,
  ) {}

  private emitInventoryChanged(flightId: string, seatNo: string, available: boolean) {
    void this.seatAvailRedis.syncSeat(flightId, seatNo, available);
    this.kafka.emit('inventory.changed', { flightId, seatNo, available });
  }

  async dispatch(topic: string, payload: any) {
    if (topic === 'seat.lock') return this.handleSeatLock(payload);
    if (topic === 'seat.release') return this.handleSeatRelease(payload);
    if (topic === 'seat.confirm') return this.handleSeatConfirm(payload);
    this.logger.warn(`unhandled topic=${topic}`);
  }

  async handleSeatLock(data: {
    bookingId: string;
    flightId: string;
    seatNo: string;
    ttlSeconds?: number;
  }) {
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
      this.emitInventoryChanged(data.flightId, data.seatNo, false);
    } else {
      this.kafka.emit('seat.lock.failed', {
        bookingId: data.bookingId,
        reason: result.reason,
      });
    }
  }

  async handleSeatRelease(data: {
    bookingId: string;
    flightId: string;
    seatNo: string;
    lockToken: string;
  }) {
    this.logger.log(`seat.release received: booking=${data.bookingId}`);
    await this.locker.release(data.flightId, data.seatNo, data.lockToken);
    this.emitInventoryChanged(data.flightId, data.seatNo, true);
  }

  async handleSeatConfirm(data: {
    bookingId: string;
    flightId: string;
    seatNo: string;
    lockToken: string;
  }) {
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
}

