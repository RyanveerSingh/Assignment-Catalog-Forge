import { z } from "zod";
import { getDb } from "@/db/client";
import { getChaosState, setChaos } from "@/lib/app-settings";
import { DEMO_CHAOS_TTL_MS, isDemoLockdown } from "@/lib/demo-lockdown";
import { HttpError, json, withApi } from "@/lib/http";
import { currentUser } from "@/lib/session";
import { getLogger } from "@/lib/logger";

/**
 * Chaos panel: inject AI failures live to demonstrate retries, pauses and repair (EC-D1, D8, D9).
 * Any signed-in user may toggle it in this demo build. The knobs are process-global, not per store:
 * the AI provider is shared by every store's jobs. In the shared demo they lapse after
 * DEMO_CHAOS_TTL_MS, so a reviewer who leaves 100% failures on does not break the next reviewer.
 */
const schema = z.object({
  rateLimitPct: z.number().min(0).max(100),
  timeoutPct: z.number().min(0).max(100),
  invalidJsonPct: z.number().min(0).max(100),
  inventedClaimPct: z.number().min(0).max(100).default(0),
});

function serialize(state: { settings: z.infer<typeof schema>; expiresAt: number | null }) {
  return { ...state.settings, expiresAt: state.expiresAt === null ? null : new Date(state.expiresAt).toISOString() };
}

export const GET = withApi(async () => {
  if (!(await currentUser())) throw new HttpError(401, "unauthenticated", "Sign in to continue");
  return json(serialize(await getChaosState(getDb())));
});

export const PATCH = withApi(async (req: Request) => {
  if (!(await currentUser())) throw new HttpError(401, "unauthenticated", "Sign in to continue");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "invalid_body", "Percentages 0–100 for rateLimitPct, timeoutPct, invalidJsonPct, inventedClaimPct");
  const state = await setChaos(getDb(), parsed.data, isDemoLockdown() ? { ttlMs: DEMO_CHAOS_TTL_MS } : {});
  getLogger({ component: "chaos" }).warn({ ...parsed.data, expiresAt: state.expiresAt }, "chaos settings changed");
  return json(serialize(state));
});
