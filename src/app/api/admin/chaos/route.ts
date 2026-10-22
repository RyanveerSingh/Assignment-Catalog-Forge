import { z } from "zod";
import { getDb } from "@/db/client";
import { refreshChaos, setChaos } from "@/lib/app-settings";
import { HttpError, json, withApi } from "@/lib/http";
import { currentUser } from "@/lib/session";
import { getLogger } from "@/lib/logger";

/**
 * Chaos panel: inject AI failures live to demonstrate retries, pauses and repair (EC-D1, D8, D9).
 * Any signed-in user may toggle it in this demo build.
 */
const schema = z.object({
  rateLimitPct: z.number().min(0).max(100),
  timeoutPct: z.number().min(0).max(100),
  invalidJsonPct: z.number().min(0).max(100),
});

export const GET = withApi(async () => {
  if (!(await currentUser())) throw new HttpError(401, "unauthenticated", "Sign in to continue");
  return json(await refreshChaos(getDb()));
});

export const PATCH = withApi(async (req: Request) => {
  if (!(await currentUser())) throw new HttpError(401, "unauthenticated", "Sign in to continue");
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "invalid_body", "Percentages 0–100 for rateLimitPct, timeoutPct, invalidJsonPct");
  await setChaos(getDb(), parsed.data);
  getLogger({ component: "chaos" }).warn(parsed.data, "chaos settings changed");
  return json(parsed.data);
});
