/**
 * In-memory fixed-window counters. Enough for one web process (the free deployment runs exactly
 * one); several replicas would each count separately, which only makes the limit looser.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Milliseconds until the current window ends; 0 when allowed. */
  retryAfterMs: number;
  remaining: number;
}

export interface RateLimiter {
  /** Would one more unit be allowed? Does not count it. */
  check(key: string): RateLimitDecision;
  /** Count `weight` units against the key. */
  hit(key: string, weight?: number): void;
  /** Check and count in one step; nothing is counted when the request is refused. */
  consume(key: string, weight?: number): RateLimitDecision;
  reset(key: string): void;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  now?: () => number;
  /** Bound on tracked keys so a flood of distinct keys cannot grow memory without limit. */
  maxKeys?: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export function createRateLimiter({ limit, windowMs, now = Date.now, maxKeys = 10_000 }: RateLimiterOptions): RateLimiter {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("rate limit must be a positive integer");
  if (!(windowMs > 0)) throw new Error("rate limit window must be positive");
  const windows = new Map<string, Window>();

  function current(key: string): Window | undefined {
    const w = windows.get(key);
    if (w && w.resetAt <= now()) {
      windows.delete(key);
      return undefined;
    }
    return w;
  }

  function prune(): void {
    const t = now();
    for (const [k, w] of windows) if (w.resetAt <= t) windows.delete(k);
    // Still full: drop the oldest entries (Map iterates in insertion order).
    for (const k of windows.keys()) {
      if (windows.size < maxKeys) break;
      windows.delete(k);
    }
  }

  function decide(w: Window | undefined, weight: number): RateLimitDecision {
    const used = w?.count ?? 0;
    if (used + weight > limit) return { allowed: false, retryAfterMs: Math.max(0, (w?.resetAt ?? now()) - now()), remaining: Math.max(0, limit - used) };
    return { allowed: true, retryAfterMs: 0, remaining: limit - used - weight };
  }

  function hit(key: string, weight = 1): void {
    const w = current(key);
    if (w) {
      w.count += weight;
      return;
    }
    if (windows.size >= maxKeys) prune();
    windows.set(key, { count: weight, resetAt: now() + windowMs });
  }

  return {
    check: (key) => decide(current(key), 1),
    hit,
    consume(key, weight = 1) {
      const decision = decide(current(key), weight);
      if (decision.allowed) hit(key, weight);
      return decision;
    },
    reset: (key) => {
      windows.delete(key);
    },
  };
}

/** "3 min" / "45 s" for messages; never "0 s". */
export function formatRetryAfter(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  return seconds >= 120 ? `${Math.ceil(seconds / 60)} min` : `${seconds} s`;
}

/**
 * The caller's address as the proxy reported it. Only used as part of a rate-limit key: a spoofed
 * header can at worst move a client into its own bucket, which the per-email cap still bounds.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip")?.trim() || "unknown";
}
