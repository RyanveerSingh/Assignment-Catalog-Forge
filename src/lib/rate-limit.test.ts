import { describe, expect, it } from "vitest";
import { clientIp, createRateLimiter, formatRetryAfter } from "./rate-limit";

function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("createRateLimiter", () => {
  it("allows up to the limit within a window, then refuses with the time left", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 3, windowMs: 60_000, now: c.now });
    expect([1, 2, 3].map(() => rl.consume("k").allowed)).toEqual([true, true, true]);
    c.advance(10_000);
    expect(rl.consume("k")).toEqual({ allowed: false, retryAfterMs: 50_000, remaining: 0 });
  });

  it("starts a fresh window once the old one ends", () => {
    const c = clock();
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000, now: c.now });
    expect(rl.consume("k").allowed).toBe(true);
    expect(rl.consume("k").allowed).toBe(false);
    c.advance(1_000);
    expect(rl.consume("k").allowed).toBe(true);
  });

  it("counts keys independently", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000, now: clock().now });
    expect(rl.consume("a").allowed).toBe(true);
    expect(rl.consume("b").allowed).toBe(true);
    expect(rl.consume("a").allowed).toBe(false);
  });

  it("check does not count; hit does", () => {
    const rl = createRateLimiter({ limit: 2, windowMs: 1_000, now: clock().now });
    expect(rl.check("k")).toMatchObject({ allowed: true, remaining: 1 });
    expect(rl.check("k")).toMatchObject({ allowed: true, remaining: 1 });
    rl.hit("k");
    rl.hit("k");
    expect(rl.check("k").allowed).toBe(false);
  });

  it("a refused weighted consume counts nothing and reports what is left", () => {
    const rl = createRateLimiter({ limit: 10, windowMs: 1_000, now: clock().now });
    expect(rl.consume("k", 7)).toMatchObject({ allowed: true, remaining: 3 });
    expect(rl.consume("k", 5)).toMatchObject({ allowed: false, remaining: 3 });
    expect(rl.consume("k", 3)).toMatchObject({ allowed: true, remaining: 0 });
  });

  it("reset clears a key", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 1_000, now: clock().now });
    rl.hit("k");
    expect(rl.check("k").allowed).toBe(false);
    rl.reset("k");
    expect(rl.check("k").allowed).toBe(true);
  });

  it("bounds memory: past maxKeys the oldest key is dropped", () => {
    const rl = createRateLimiter({ limit: 1, windowMs: 60_000, now: clock().now, maxKeys: 3 });
    for (const k of ["a", "b", "c", "d"]) rl.hit(k);
    expect(rl.check("a").allowed).toBe(true);
    expect(rl.check("d").allowed).toBe(false);
  });

  it.each([{ limit: 0, windowMs: 1 }, { limit: 1.5, windowMs: 1 }, { limit: 1, windowMs: 0 }])("rejects invalid options %j", (opts) => {
    expect(() => createRateLimiter(opts)).toThrow();
  });
});

describe("formatRetryAfter", () => {
  it.each([
    [0, "1 s"],
    [400, "1 s"],
    [45_000, "45 s"],
    [119_000, "119 s"],
    [120_000, "2 min"],
    [9 * 60_000 + 1, "10 min"],
  ])("%d ms is shown as %s", (ms, expected) => {
    expect(formatRetryAfter(ms)).toBe(expected);
  });
});

describe("clientIp", () => {
  it("takes the first X-Forwarded-For hop", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to X-Real-IP, then to 'unknown'", () => {
    expect(clientIp(new Headers({ "x-real-ip": " 198.51.100.2 " }))).toBe("198.51.100.2");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
