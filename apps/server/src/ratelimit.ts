/**
 * Token-bucket rate limiter. Each key gets `capacity` tokens that refill at
 * `refillPerSec`. `take()` returns false when the caller should be rejected.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly now: () => number = Date.now,
  ) {}

  take(key: string, cost = 1): boolean {
    const t = this.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.capacity, updated: t };
      this.buckets.set(key, b);
    }
    const elapsed = (t - b.updated) / 1000;
    b.tokens = Math.min(this.capacity, b.tokens + elapsed * this.refillPerSec);
    b.updated = t;
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    if (this.buckets.size > 10_000) this.prune(t);
    return true;
  }

  private prune(t: number) {
    for (const [k, b] of this.buckets) {
      if (t - b.updated > 3_600_000) this.buckets.delete(k);
    }
  }
}
