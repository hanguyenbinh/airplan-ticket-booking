import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Seat } from './entities/seat.entity';
import { KafkaProducer } from 'kafka-rdkafka';
import { SharedSeatAvailabilityRedisService } from './shared-seat-availability-redis.service';

/**
 * On startup, publishes DB state of AVAILABLE seats so booking-service can reject invalid seats
 * before emitting saga traffic. Also writes Redis when REDIS_URL is set so all booking pods share state.
 */
@Injectable()
export class SeatAvailabilityPublisherService implements OnModuleInit {
  private readonly logger = new Logger(SeatAvailabilityPublisherService.name);

  constructor(
    @InjectRepository(Seat) private readonly seatRepo: Repository<Seat>,
    private readonly kafka: KafkaProducer,
    private readonly seatAvailRedis: SharedSeatAvailabilityRedisService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.publishInitialSnapshots();
    } catch (e) {
      this.logger.error(`publishInitialSnapshots failed: ${(e as Error)?.message}`);
    }
  }

  private async publishInitialSnapshots(): Promise<void> {
    const rows = await this.seatRepo.find({ where: { status: 'AVAILABLE' } });
    const byFlight = new Map<string, string[]>();
    for (const r of rows) {
      const arr = byFlight.get(r.flightId) ?? [];
      arr.push(r.seatNo);
      byFlight.set(r.flightId, arr);
    }
    const snapshots = [...byFlight.entries()].map(([flightId, seatNos]) => ({ flightId, seatNos }));
    await this.seatAvailRedis.replaceAllFromSnapshots(snapshots);
    this.kafka.emit('inventory.available.init', { snapshots });
    this.logger.log(`inventory.available.init batch flights=${snapshots.length} rows=${rows.length}`);
  }
}
