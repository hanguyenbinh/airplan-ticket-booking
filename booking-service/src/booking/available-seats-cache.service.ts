import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/** Must match inventory-service `shared-seat-availability-redis.service.ts`. */
const SEAT_AVAIL_PREFIX = 'airline:sa:';
const seatAvailKey = (flightId: string) => `${SEAT_AVAIL_PREFIX}${flightId}`;
const seatAvailIndexKey = () => `${SEAT_AVAIL_PREFIX}idx`;

const TRY_RESERVE_LUA = `
local k = KEYS[1]
if redis.call('EXISTS', k) == 0 then return 2 end
if redis.call('SISMEMBER', k, ARGV[1]) == 0 then return 0 end
redis.call('SREM', k, ARGV[1])
return 1
`;

const UNRESERVE_LUA = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 0 end
redis.call('SADD', KEYS[1], ARGV[1])
redis.call('SADD', KEYS[2], ARGV[2])
return 1
`;

/**
 * Seat availability for fast reject + optimistic reserve before saga.
 * - With REDIS_URL: shared with inventory (same keys); all booking replicas see the same data.
 * - Without REDIS_URL: in-memory only (single booking pod / dev); Kafka init still warms one pod.
 */
@Injectable()
export class AvailableSeatsCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(AvailableSeatsCacheService.name);
  private readonly byFlight = new Map<string, Set<string>>();
  private readonly redis: Redis | null = null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (url) {
      this.redis = new Redis(url, { maxRetriesPerRequest: 2, enableReadyCheck: true });
      this.redis.on('error', (e) => this.logger.error(`Redis seat cache: ${e.message}`));
      this.logger.log('Seat availability cache: Redis (cluster-wide)');
    } else {
      this.logger.warn('Seat availability cache: in-memory only (set REDIS_URL for multi booking pod)');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) await this.redis.quit();
  }

  get usesRedis(): boolean {
    return this.redis != null;
  }

  /** Full reset from `inventory.available.init` (Kafka) — mirrors Redis if inventory already wrote. */
  async replaceAllFromInventoryInit(snapshots: { flightId: string; seatNos?: string[] }[]) {
    this.byFlight.clear();
    let seats = 0;
    for (const s of snapshots) {
      if (!s?.flightId) continue;
      const set = new Set((s.seatNos ?? []).filter(Boolean));
      this.byFlight.set(s.flightId, set);
      seats += set.size;
    }
    this.logger.log(`cache init (memory): flights=${this.byFlight.size} seats=${seats}`);

    if (!this.redis) return;
    const idx = seatAvailIndexKey();
    const oldIds = await this.redis.smembers(idx);
    const newIds = new Set(snapshots.map((s) => s.flightId).filter(Boolean));
    const pipe = this.redis.pipeline();
    for (const id of oldIds) {
      if (!newIds.has(id)) pipe.del(seatAvailKey(id));
    }
    pipe.del(idx);
    for (const s of snapshots) {
      if (!s?.flightId) continue;
      const k = seatAvailKey(s.flightId);
      pipe.del(k);
      for (const seat of s.seatNos ?? []) {
        if (seat) pipe.sadd(k, seat);
      }
      pipe.sadd(idx, s.flightId);
    }
    await pipe.exec();
  }

  async applyAvailability(flightId: string, seatNo: string, available: boolean) {
    if (!flightId || !seatNo) return;
    if (this.redis) {
      if (available) {
        await this.redis.sadd(seatAvailKey(flightId), seatNo);
        await this.redis.sadd(seatAvailIndexKey(), flightId);
      } else {
        await this.redis.srem(seatAvailKey(flightId), seatNo);
      }
    }
    if (available) {
      let set = this.byFlight.get(flightId);
      if (!set) {
        set = new Set();
        this.byFlight.set(flightId, set);
      }
      set.add(seatNo);
    } else {
      const set = this.byFlight.get(flightId);
      if (!set) return;
      set.delete(seatNo);
    }
  }

  /**
   * Reserve seat for a new booking. With Redis: atomic SREM. Without: in-memory delete.
   * Returns false when snapshot exists and seat is not available.
   */
  async tryReserveSeatInCache(flightId: string, seatNo: string): Promise<boolean> {
    if (this.redis) {
      const r = (await this.redis.eval(TRY_RESERVE_LUA, 1, seatAvailKey(flightId), seatNo)) as number;
      return r === 1 || r === 2;
    }
    const set = this.byFlight.get(flightId);
    if (!set) return true;
    if (!set.has(seatNo)) return false;
    set.delete(seatNo);
    return true;
  }

  async unreserveSeatInCache(flightId: string, seatNo: string): Promise<void> {
    if (this.redis) {
      await this.redis.eval(UNRESERVE_LUA, 2, seatAvailKey(flightId), seatAvailIndexKey(), seatNo, flightId);
    }
    let set = this.byFlight.get(flightId);
    if (!set) {
      set = new Set();
      this.byFlight.set(flightId, set);
    }
    set.add(seatNo);
  }
}
