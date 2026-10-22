import type { z } from "zod";
import { AiError } from "./errors";
import type { AiProvider, AiRequest, AiResponse } from "./types";

export interface ChaosSettings {
  rateLimitPct: number;
  timeoutPct: number;
  invalidJsonPct: number;
}

/**
 * Fault injection for demos and tests: wraps any provider and randomly turns calls into the failures
 * the pipeline must survive (EC-D1, D8, D9). Percentages are read on every call so the dashboard
 * can change them live.
 */
export function withChaos(inner: AiProvider, getSettings: () => ChaosSettings, random: () => number = Math.random): AiProvider {
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
      return inner.complete(req);
    },
    createBatch: (reqs) => inner.createBatch(reqs),
    batchStatus: (id) => inner.batchStatus(id),
    batchResults: <T>(id: string, schema: z.ZodType<T>) => inner.batchResults(id, schema),
  };
}
