import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/** Same prefix as booking-service `AvailableSeatsCacheService` (shared store). */
export const SEAT_AVAIL_REDIS_PREFIX = 'airline:sa:';

export function seatAvailRedisKey(flightId: string): string {
  return `${SEAT_AVAIL_REDIS_PREFIX}${flightId}`;
}

function seatAvailIndexKey(): string {
  return `${SEAT_AVAIL_REDIS_PREFIX}idx`;
}

/**
 * Writes the booking seat-availability snapshot to Redis so every booking-service pod
 * shares the same view (Kafka init is only consumed by one member of a consumer group).
 */
@Injectable()
export class SharedSeatAvailabilityRedisService implements OnModuleDestroy {
  private readonly logger = new Logger(SharedSeatAvailabilityRedisService.name);
  private readonly redis: Redis | null = null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL unset — shared seat availability not written to Redis');
      return;
    }
    this.redis = new Redis(url, { maxRetriesPerRequest: 2, enableReadyCheck: true });
    this.redis.on('error', (e) => this.logger.error(`Redis: ${e.message}`));
  }

  get enabled(): boolean {
    return this.redis != null;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) await this.redis.quit();
  }

  /** Replace all per-flight SETs from DB snapshot (full reset). */
  async replaceAllFromSnapshots(snapshots: { flightId: string; seatNos?: string[] }[]): Promise<void> {
    if (!this.redis) return;
    const idx = seatAvailIndexKey();
    const oldIds = await this.redis.smembers(idx);
    const newIds = new Set(snapshots.map((s) => s.flightId).filter(Boolean));
    const pipe = this.redis.pipeline();
    for (const id of oldIds) {
      if (!newIds.has(id)) pipe.del(seatAvailRedisKey(id));
    }
    pipe.del(idx);
    for (const s of snapshots) {
      if (!s?.flightId) continue;
      const k = seatAvailRedisKey(s.flightId);
      pipe.del(k);
      for (const seat of s.seatNos ?? []) {
        if (seat) pipe.sadd(k, seat);
      }
      pipe.sadd(idx, s.flightId);
    }
    await pipe.exec();
    this.logger.log(`redis seat avail reset flights=${snapshots.length}`);
  }

  /** Single-seat delta (same semantics as `inventory.changed`). */
  async syncSeat(flightId: string, seatNo: string, available: boolean): Promise<void> {
    if (!this.redis || !flightId || !seatNo) return;
    const k = seatAvailRedisKey(flightId);
    if (available) {
      await this.redis.sadd(k, seatNo);
      await this.redis.sadd(seatAvailIndexKey(), flightId);
    } else {
      await this.redis.srem(k, seatNo);
    }
  }
}
