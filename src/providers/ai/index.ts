import { currentChaos } from "@/lib/app-settings";
import { getConfig } from "@/lib/config";
import { sha256Hex } from "@/lib/crypto";
import { createAnthropicProvider } from "./anthropic";
import { withChaos } from "./chaos";
import { createMockProvider } from "./mock";
import type { AiProvider } from "./types";

const providers = new Map<string, AiProvider>();

export interface ProviderChoice {
  provider: AiProvider;
  /** "mock" when no key is available, so the UI can show the demo-mode banner (EC-J1). */
  mode: "anthropic" | "mock";
}

/**
 * Resolve the provider for a store. A store-level key (decrypted by the caller) wins over the
 * server key; with neither, the deterministic mock runs so the pipeline still works end to end.
 */
export function getAiProvider(storeApiKey?: string | null): ProviderChoice {
  const cfg = getConfig();
  const key = storeApiKey || (cfg.AI_PROVIDER === "anthropic" ? cfg.ANTHROPIC_API_KEY : undefined);
  const cacheKey = key ? `anthropic:${sha256Hex(key).slice(0, 16)}` : "mock";
  let provider = providers.get(cacheKey);
  if (!provider) {
    provider = withChaos(key ? createAnthropicProvider(key) : createMockProvider(), currentChaos);
    providers.set(cacheKey, provider);
  }
  return { provider, mode: key ? "anthropic" : "mock" };
}

/** Model ids per routing tier; the mock provider accepts any model name. */
export function modelForTier(tier: "cheap" | "strong" | "vision" | "escalation", mode: "anthropic" | "mock"): string {
  if (mode === "mock") return tier === "cheap" ? "mock-cheap" : "mock-strong";
  const cfg = getConfig();
  switch (tier) {
    case "cheap":
      return cfg.AI_MODEL_CHEAP;
    case "strong":
    case "vision":
      return cfg.AI_MODEL_STRONG;
    case "escalation":
      return cfg.AI_MODEL_ESCALATION;
  }
}

export type { AiBatchHandle, AiBatchResult, AiImage, AiProvider, AiPurpose, AiRequest, AiResponse, AiUsage } from "./types";
export { AiError, isAiError } from "./errors";
export { costMicros, naiveCostMicros } from "./pricing";
