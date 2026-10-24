import { DEMO_EMAIL } from "./demo-lockdown";
import { createRateLimiter, formatRetryAfter, type RateLimiter } from "./rate-limit";

/**
 * Failed-login throttling. The tight limit is per email and address, so one guesser cannot lock
 * anyone else out; a looser per-email limit bounds a guesser who rotates spoofed addresses. The
 * shared demo account's password is printed on the login page, so it only gets the per-address limit:
 * nobody can lock reviewers out of it by failing on purpose.
 */

export const LOGIN_FAILURES_PER_ADDRESS = 10;
export const LOGIN_FAILURES_PER_EMAIL = 100;
export const LOGIN_WINDOW_MS = 10 * 60_000;

export interface LoginThrottle {
  /** null when the attempt may proceed, otherwise the message for a 429. */
  blocked(email: string, ip: string): { message: string; retryAfterMs: number } | null;
  recordFailure(email: string, ip: string): void;
  recordSuccess(email: string, ip: string): void;
}

export function createLoginThrottle(now: () => number = Date.now): LoginThrottle {
  const perAddress: RateLimiter = createRateLimiter({ limit: LOGIN_FAILURES_PER_ADDRESS, windowMs: LOGIN_WINDOW_MS, now });
  const perEmail: RateLimiter = createRateLimiter({ limit: LOGIN_FAILURES_PER_EMAIL, windowMs: LOGIN_WINDOW_MS, now });
  const norm = (email: string): string => email.trim().toLowerCase();
  const addressKey = (email: string, ip: string): string => `${norm(email)}|${ip}`;
  const emailLimited = (email: string): boolean => norm(email) !== DEMO_EMAIL;

  return {
    blocked(email, ip) {
      const a = perAddress.check(addressKey(email, ip));
      const e = emailLimited(email) ? perEmail.check(norm(email)) : a;
      if (a.allowed && e.allowed) return null;
      const retryAfterMs = Math.max(a.retryAfterMs, e.retryAfterMs);
      return { retryAfterMs, message: `Too many failed sign-in attempts. Try again in ${formatRetryAfter(retryAfterMs)}.` };
    },
    recordFailure(email, ip) {
      perAddress.hit(addressKey(email, ip));
      if (emailLimited(email)) perEmail.hit(norm(email));
    },
    recordSuccess(email, ip) {
      perAddress.reset(addressKey(email, ip));
    },
  };
}

/** The process-wide throttle used by the login route. */
export const loginThrottle: LoginThrottle = createLoginThrottle();
