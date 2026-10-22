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
  return { rateLimitPct: cfg.CHAOS_RATE_LIMIT_PCT, timeoutPct: cfg.CHAOS_TIMEOUT_PCT, invalidJsonPct: cfg.CHAOS_INVALID_JSON_PCT };
}

let chaosSnapshot: ChaosSettings | null = null;

/** Synchronous view for the provider wrapper; refreshed by `refreshChaos` before AI work. */
export function currentChaos(): ChaosSettings {
  return chaosSnapshot ?? chaosFromEnv();
}

export async function refreshChaos(db: DbOrTx): Promise<ChaosSettings> {
  chaosSnapshot = await getSetting<ChaosSettings>(db, CHAOS_KEY, chaosFromEnv());
  return chaosSnapshot;
}

export async function setChaos(db: DbOrTx, settings: ChaosSettings): Promise<void> {
  await setSetting(db, CHAOS_KEY, settings);
  chaosSnapshot = settings;
}
