import { getConfig } from "./config";
import { HttpError } from "./http";
import { createRateLimiter, formatRetryAfter } from "./rate-limit";

/**
 * The public demo shares one owner account between every reviewer, so the account must not be able
 * to spend the operator's AI key without bound or change what every other reviewer sees. Under
 * DEMO_LOCKDOWN (on by default wherever SEED_DEMO=true) the demo account keeps everything the
 * product is about (imports, review, publishing, chaos, the worker crash) but not the knobs that
 * cost money or reconfigure the shared stores.
 */

export const DEMO_EMAIL = "demo@catalogforge.dev";
export const DEMO_PASSWORD = "demo1234";

export const DEMO_LOCKED_CODE = "demo_locked";
export const DEMO_LOCKED_PREFIX = "Locked in the shared demo";
export const DEMO_MAX_API_KEYS = 10;
/** Chaos left on by one reviewer switches itself off for the next one. */
export const DEMO_CHAOS_TTL_MS = 15 * 60_000;
export const DEMO_CRASH_COOLDOWN_MS = 2 * 60_000;
export const DEMO_RERUN_LIMIT = 100;
export const DEMO_RERUN_WINDOW_MS = 10 * 60_000;

/** What the settings page greys out, sent with the store settings so the UI never fails silently. */
export interface DemoLockInfo {
  message: string;
  budgetCapCents: number;
  apiKey: true;
  languages: true;
}

export function resolveDemoLockdown(env: { DEMO_LOCKDOWN?: string; SEED_DEMO?: string }): boolean {
  if (env.DEMO_LOCKDOWN === "true") return true;
  if (env.DEMO_LOCKDOWN === "false") return false;
  return env.SEED_DEMO === "true";
}

export function isDemoLockdown(): boolean {
  return resolveDemoLockdown(getConfig());
}

/** Every account is locked on a public deployment: self-registered accounts spend the same operator key as the demo one. */
export function isLockedDemoUser(user: { email: string }): boolean {
  void user;
  return isDemoLockdown();
}

export function demoLocked(detail: string): HttpError {
  return new HttpError(403, DEMO_LOCKED_CODE, `${DEMO_LOCKED_PREFIX}: ${detail}`);
}

export function demoLockInfo(budgetCapCents: number): DemoLockInfo {
  return {
    message: `${DEMO_LOCKED_PREFIX}: the API key, the languages and budgets above ${formatCents(budgetCapCents)} can only be changed on your own deployment.`,
    budgetCapCents,
    apiKey: true,
    languages: true,
  };
}

export interface SettingsChange {
  apiKey?: string;
  importBudgetCents?: number;
  locales?: string[];
  countryLocaleMap?: Record<string, string>;
}

export interface CurrentLockedSettings {
  locales: string[];
  countryLocaleMap: Record<string, string>;
}

/**
 * The first locked field a settings patch would change, as a message, or null. Re-sending the
 * current value is not a change, so a form that saves several fields at once still works.
 */
export function lockedSettingsChange(change: SettingsChange, current: CurrentLockedSettings, budgetCapCents: number): string | null {
  if (change.apiKey !== undefined) return "the Anthropic API key cannot be changed; imports use the operator's key or demo mode";
  if (change.importBudgetCents !== undefined && change.importBudgetCents > budgetCapCents) {
    return `the import budget is capped at ${formatCents(budgetCapCents)}`;
  }
  if (change.locales !== undefined && !sameSet(["en", ...change.locales], current.locales)) return "the published languages cannot be changed";
  if (change.countryLocaleMap !== undefined && !sameMap(change.countryLocaleMap, current.countryLocaleMap)) return "the country → language map cannot be changed";
  return null;
}

/** Per-upload budgets are clamped rather than refused: the upload form's default is above the cap. */
export function capImportBudget(requested: number | undefined, fallbackCents: number, capCents: number): { budgetCents: number; warning?: string } {
  const wanted = requested ?? fallbackCents;
  if (wanted <= capCents) return { budgetCents: wanted };
  return { budgetCents: capCents, warning: `${DEMO_LOCKED_PREFIX}: the AI budget for this import was capped at ${formatCents(capCents)}` };
}

// One web process serves the demo, so process-wide counters are the whole picture.
const crashCooldown = createRateLimiter({ limit: 1, windowMs: DEMO_CRASH_COOLDOWN_MS });
const rerunLimiter = createRateLimiter({ limit: DEMO_RERUN_LIMIT, windowMs: DEMO_RERUN_WINDOW_MS });

/** The crash demo stays available to every reviewer, but at most once per cooldown across all of them. */
export function assertDemoCrashAllowed(): void {
  const d = crashCooldown.check("worker");
  if (!d.allowed) {
    throw new HttpError(429, "demo_rate_limited", `${DEMO_LOCKED_PREFIX}: the worker can be crashed once every ${DEMO_CRASH_COOLDOWN_MS / 60_000} minutes; try again in ${formatRetryAfter(d.retryAfterMs)}`, {
      retryAfterMs: d.retryAfterMs,
    });
  }
}

export function recordDemoCrash(): void {
  crashCooldown.hit("worker");
}

/** Re-running the AI stage spends the operator's key; a store gets a bounded number of products per window. */
export function consumeDemoReruns(storeId: string, count: number): void {
  const d = rerunLimiter.consume(storeId, count);
  if (!d.allowed) {
    const left = d.remaining > 0 ? `${d.remaining} more can be re-run now, or try again in ${formatRetryAfter(d.retryAfterMs)}` : `try again in ${formatRetryAfter(d.retryAfterMs)}`;
    throw new HttpError(429, "demo_rate_limited", `${DEMO_LOCKED_PREFIX}: at most ${DEMO_RERUN_LIMIT} products can be re-run every ${DEMO_RERUN_WINDOW_MS / 60_000} minutes; ${left}`, {
      retryAfterMs: d.retryAfterMs,
    });
  }
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function sameSet(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

function sameMap(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => Object.hasOwn(b, k) && b[k] === a[k]);
}
