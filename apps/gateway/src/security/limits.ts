/**
 * Abuse and bill protection. In memory for Phase 1 (single instance).
 * Phase 5: move usage to Postgres (durable billing record) and slots to Redis (multi-instance).
 */
import { env } from "../config/env";

/** Limits how many live sessions one user can hold at once. */
export class SessionSlots {
  private readonly active = new Map<string, number>();
  constructor(private readonly maxPerUser: number) {}

  acquire(userId: string): boolean {
    const count = this.active.get(userId) ?? 0;
    if (count >= this.maxPerUser) return false;
    this.active.set(userId, count + 1);
    return true;
  }

  release(userId: string): void {
    const count = (this.active.get(userId) ?? 1) - 1;
    if (count <= 0) this.active.delete(userId);
    else this.active.set(userId, count);
  }
}

/** Minutes of audio per user per UTC day. */
export class DailyUsage {
  private readonly usage = new Map<string, { day: string; ms: number }>();
  constructor(private readonly quotaMs: number) {}

  private static today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  usedMs(userId: string): number {
    const entry = this.usage.get(userId);
    return entry && entry.day === DailyUsage.today() ? entry.ms : 0;
  }

  remainingMs(userId: string): number {
    return Math.max(0, this.quotaMs - this.usedMs(userId));
  }

  add(userId: string, ms: number): void {
    this.usage.set(userId, { day: DailyUsage.today(), ms: this.usedMs(userId) + ms });
  }
}

/** Classic token bucket, used to stop clients streaming audio faster than real time. */
export class TokenBucket {
  private tokens: number;
  private lastRefill = Date.now();

  constructor(
    private readonly ratePerSecond: number,
    private readonly capacity: number,
  ) {
    this.tokens = capacity;
  }

  take(amount: number): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.lastRefill) / 1000) * this.ratePerSecond);
    this.lastRefill = now;
    if (this.tokens < amount) return false;
    this.tokens -= amount;
    return true;
  }
}

export const sessionSlots = new SessionSlots(1);
export const dailyUsage = new DailyUsage(env.DAILY_MINUTES_QUOTA * 60_000);
