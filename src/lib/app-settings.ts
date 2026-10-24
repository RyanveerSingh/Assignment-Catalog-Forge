import { eq } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { appSettings } from "@/db/schema";
import { getConfig } from "./config";
import type { ChaosSettings } from "@/providers/ai/chaos";

/**
 * Small key/value settings that must be shared between the web and worker processes and changed
 * live from the dashboard (chaos toggles, global pause). Read through a short cache.
 */

const CACHE_MS = 5_000;
const cache = new Map<string, { value: unknown; at: number }>();

export async function getSetting<T>(db: DbOrTx, key: string, fallback: T): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, key)).limit(1);
  const value = (row?.value as T | undefined) ?? fallback;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function setSetting(db: DbOrTx, key: string, value: unknown): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
  cache.set(key, { value, at: Date.now() });
}

export const CHAOS_KEY = "chaos";

export function chaosFromEnv(): ChaosSettings {
  const cfg = getConfig();
  return { rateLimitPct: cfg.CHAOS_RATE_LIMIT_PCT, timeoutPct: cfg.CHAOS_TIMEOUT_PCT, invalidJsonPct: cfg.CHAOS_INVALID_JSON_PCT, inventedClaimPct: cfg.CHAOS_INVENTED_CLAIM_PCT };
}

let chaosSnapshot: ChaosSettings | null = null;

/** Synchronous view for the provider wrapper; refreshed by `refreshChaos` before AI work. */
export function currentChaos(): ChaosSettings {
  return chaosSnapshot ?? chaosFromEnv();
}

/** What is stored: the knobs plus, in the shared demo, when they switch themselves off (epoch ms). */
type StoredChaos = Partial<ChaosSettings> & { expiresAt?: number };

export interface ChaosState {
  settings: ChaosSettings;
  /** Epoch ms when the stored knobs lapse back to the defaults; null when they never do. */
  expiresAt: number | null;
}

/** Pure: stored value → effective settings. Lapsed knobs fall back to the env defaults. */
export function resolveChaos(stored: StoredChaos, defaults: ChaosSettings, now: number): ChaosState {
  const { expiresAt, ...knobs } = stored;
  if (typeof expiresAt === "number" && expiresAt <= now) return { settings: defaults, expiresAt: null };
  // Settings saved before a knob existed lack its key; the env default fills it in.
  return { settings: { ...defaults, ...knobs }, expiresAt: typeof expiresAt === "number" ? expiresAt : null };
}

export async function getChaosState(db: DbOrTx): Promise<ChaosState> {
  const state = resolveChaos(await getSetting<StoredChaos>(db, CHAOS_KEY, {}), chaosFromEnv(), Date.now());
  chaosSnapshot = state.settings;
  return state;
}

export async function refreshChaos(db: DbOrTx): Promise<ChaosSettings> {
  return (await getChaosState(db)).settings;
}

export async function setChaos(db: DbOrTx, settings: ChaosSettings, opts: { ttlMs?: number } = {}): Promise<ChaosState> {
  const expiresAt = opts.ttlMs !== undefined ? Date.now() + opts.ttlMs : null;
  const stored: StoredChaos = expiresAt === null ? { ...settings } : { ...settings, expiresAt };
  await setSetting(db, CHAOS_KEY, stored);
  chaosSnapshot = settings;
  return { settings, expiresAt };
}
