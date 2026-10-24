import { describe, expect, it } from "vitest";
import { DEMO_EMAIL } from "./demo-lockdown";
import { createLoginThrottle, LOGIN_FAILURES_PER_ADDRESS, LOGIN_FAILURES_PER_EMAIL, LOGIN_WINDOW_MS, type LoginThrottle } from "./login-throttle";

function clock() {
  let t = 5_000_000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function fail(throttle: LoginThrottle, email: string, ip: string, times: number): void {
  for (let i = 0; i < times; i++) throttle.recordFailure(email, ip);
}

describe("login throttle", () => {
  it("blocks an email+address after 10 failures with a message ready for a 429", () => {
    const t = createLoginThrottle(clock().now);
    fail(t, "a@example.com", "1.1.1.1", LOGIN_FAILURES_PER_ADDRESS - 1);
    expect(t.blocked("a@example.com", "1.1.1.1")).toBeNull();
    t.recordFailure("a@example.com", "1.1.1.1");
    const b = t.blocked("a@example.com", "1.1.1.1");
    expect(b?.message).toBe("Too many failed sign-in attempts. Try again in 10 min.");
    expect(b?.retryAfterMs).toBe(LOGIN_WINDOW_MS);
  });

  it("treats the email case- and space-insensitively", () => {
    const t = createLoginThrottle(clock().now);
    fail(t, " A@Example.com ", "1.1.1.1", LOGIN_FAILURES_PER_ADDRESS);
    expect(t.blocked("a@example.com", "1.1.1.1")).not.toBeNull();
  });

  it("one guesser does not lock the same account out for another address", () => {
    const t = createLoginThrottle(clock().now);
    fail(t, "a@example.com", "1.1.1.1", LOGIN_FAILURES_PER_ADDRESS);
    expect(t.blocked("a@example.com", "2.2.2.2")).toBeNull();
  });

  it("a guesser rotating addresses is still bounded per email", () => {
    const t = createLoginThrottle(clock().now);
    for (let i = 0; i < LOGIN_FAILURES_PER_EMAIL; i++) t.recordFailure("a@example.com", `10.0.0.${i}`);
    expect(t.blocked("a@example.com", "9.9.9.9")).not.toBeNull();
  });

  it("the window expires", () => {
    const c = clock();
    const t = createLoginThrottle(c.now);
    fail(t, "a@example.com", "1.1.1.1", LOGIN_FAILURES_PER_ADDRESS);
    c.advance(LOGIN_WINDOW_MS);
    expect(t.blocked("a@example.com", "1.1.1.1")).toBeNull();
  });

  it("a success clears the address's failures", () => {
    const t = createLoginThrottle(clock().now);
    fail(t, "a@example.com", "1.1.1.1", LOGIN_FAILURES_PER_ADDRESS - 1);
    t.recordSuccess("a@example.com", "1.1.1.1");
    fail(t, "a@example.com", "1.1.1.1", LOGIN_FAILURES_PER_ADDRESS - 1);
    expect(t.blocked("a@example.com", "1.1.1.1")).toBeNull();
  });

  it("the shared demo account has no per-email cap, so nobody can lock reviewers out on purpose", () => {
    const t = createLoginThrottle(clock().now);
    for (let i = 0; i < LOGIN_FAILURES_PER_EMAIL + 5; i++) t.recordFailure(DEMO_EMAIL, `10.0.${i}.1`);
    expect(t.blocked(DEMO_EMAIL, "9.9.9.9")).toBeNull();
    fail(t, DEMO_EMAIL, "9.9.9.9", LOGIN_FAILURES_PER_ADDRESS);
    expect(t.blocked(DEMO_EMAIL, "9.9.9.9")).not.toBeNull();
  });
});
