import type { z } from "zod";
import { injectInventedClaims } from "@/core/ai/invent";
import type { EnrichInput } from "@/core/ai/prompts";
import type { AiEnrichBatch } from "@/core/ai/schema";
import { AiError } from "./errors";
import type { AiProvider, AiRequest, AiResponse } from "./types";

export interface ChaosSettings {
  rateLimitPct: number;
  timeoutPct: number;
  invalidJsonPct: number;
  /** Share of listing answers that get a claim the supplier negated slipped in, for the validator to catch (EC-B15). */
  inventedClaimPct: number;
}

function isEnrichBatch(value: unknown): value is AiEnrichBatch {
  return typeof value === "object" && value !== null && Array.isArray((value as { products?: unknown }).products);
}

/**
 * Fault injection for demos and tests: wraps any provider and randomly turns calls into the failures
 * the pipeline must survive (EC-D1, D8, D9), or slips an invented claim into a good answer so the
 * grounding validator has something real to block (EC-D2, B15). Percentages are read on every call
 * so the dashboard can change them live.
 */
export function withChaos(inner: AiProvider, getSettings: () => ChaosSettings, random: () => number = Math.random): AiProvider {
  function maybeInvent<T>(req: AiRequest<T>, res: AiResponse<T>): AiResponse<T> {
    const pct = getSettings().inventedClaimPct;
    if (pct <= 0 || (req.purpose !== "enrich" && req.purpose !== "vision") || random() * 100 >= pct) return res;
    if (!isEnrichBatch(res.output)) return res;
    const { output } = injectInventedClaims(res.output, req.input as EnrichInput);
    return { ...res, output: output as T };
  }
  function maybeFail(): void {
    const s = getSettings();
    const roll = random() * 100;
    if (s.rateLimitPct > 0 && roll < s.rateLimitPct) {
      throw new AiError("rate_limit", "Chaos: simulated 429 rate limit", { retryAfterMs: 20_000, status: 429 });
    }
    if (s.timeoutPct > 0 && roll < s.rateLimitPct + s.timeoutPct) {
      throw new AiError("timeout", "Chaos: simulated request timeout");
    }
    if (s.invalidJsonPct > 0 && roll < s.rateLimitPct + s.timeoutPct + s.invalidJsonPct) {
      throw new AiError("invalid_json", "Chaos: simulated malformed JSON from the model", { rawText: '{"products": [ "oops' });
    }
  }
  return {
    name: inner.name,
    async complete<T>(req: AiRequest<T>): Promise<AiResponse<T>> {
      maybeFail();
      return maybeInvent(req, await inner.complete(req));
    },
    createBatch: (reqs) => inner.createBatch(reqs),
    batchStatus: (id) => inner.batchStatus(id),
    batchResults: <T>(id: string, schema: z.ZodType<T>) => inner.batchResults(id, schema),
  };
}
