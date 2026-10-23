import { computeCostStrategies, isDemoModel, type ModelRates } from "@/core/metrics/cost-strategies";
import { getDb } from "@/db/client";
import { getStoreMetrics } from "@/db/repositories/metrics";
import { getConfig } from "@/lib/config";
import { json, withApi } from "@/lib/http";
import { requireStore } from "@/lib/session";
import { getPricing } from "@/providers/ai/pricing";

type Ctx = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

/** The demo provider's two tiers are priced at the configured cheap and strong models' list rates. */
function ratesFor(model: string): ModelRates {
  const cfg = getConfig();
  if (!isDemoModel(model)) return getPricing(model);
  return getPricing(model === "mock-cheap" ? cfg.AI_MODEL_CHEAP : cfg.AI_MODEL_STRONG);
}

export const GET = withApi(async (_req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store } = await requireStore(slug);
  const metrics = await getStoreMetrics(getDb(), store.id);
  const strategies = computeCostStrategies(metrics.usage, { rates: ratesFor, strongModel: getConfig().AI_MODEL_STRONG, productsThroughAi: metrics.productsThroughAi });
  return json({ ...metrics, strategies });
});
