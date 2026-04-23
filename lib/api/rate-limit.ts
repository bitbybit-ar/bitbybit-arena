/**
 * Rate-limit store abstraction.
 *
 * The default implementation is an in-memory `Map`, which is *per
 * serverless instance* — N concurrent Lambdas means N independent
 * counters, so the effective ceiling is N × (configured max). That's
 * fine for hackathon-scale traffic but won't hold up under sustained
 * abuse. When the time comes, swap `defaultRateLimitStore` for an
 * Upstash/KV-backed implementation that satisfies this interface
 * (the `apiHandler` doesn't care which one it gets).
 *
 * Why an interface and not a direct Upstash dep right now: adopting
 * Upstash means an account, secrets in Vercel, a network hop on
 * every request, and a runtime dep we don't strictly need yet. The
 * abstraction keeps that decision reversible for the cost of ~30 LOC.
 */

export interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitStore {
  /**
   * Read the current entry for `key`. Implementations may return a
   * stale value if `now > entry.resetAt`; the caller treats that as
   * "no entry" and starts a fresh window.
   */
  get(key: string): RateLimitEntry | undefined;
  /** Replace the entry for `key`. */
  set(key: string, entry: RateLimitEntry): void;
}

class InMemoryRateLimitStore implements RateLimitStore {
  private readonly map = new Map<string, RateLimitEntry>();

  get(key: string): RateLimitEntry | undefined {
    return this.map.get(key);
  }

  set(key: string, entry: RateLimitEntry): void {
    this.map.set(key, entry);
  }
}

/**
 * Singleton store used by `apiHandler`. Replace this binding (or pass
 * a different store to a future ratelimiter constructor) when
 * migrating to a durable backend.
 */
export const defaultRateLimitStore: RateLimitStore = new InMemoryRateLimitStore();
