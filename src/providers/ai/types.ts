import type { z } from "zod";

export type AiPurpose = "enrich" | "vision" | "translate" | "repair" | "eval";

export interface AiImage {
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  base64: string;
  /** Filename, for the mock provider and logs. */
  name: string;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AiRequest<T> {
  purpose: AiPurpose;
  model: string;
  /** Stable, cacheable system prompt. Keep volatile content out of it. */
  system: string;
  /** The user turn, rendered for the model. */
  userText: string;
  images?: AiImage[];
  /** The same payload the user text was rendered from; the mock provider reads this directly. */
  input: unknown;
  schema: z.ZodType<T>;
  maxTokens: number;
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
  /** Stable id for batch results and caching. */
  customId?: string;
}

export interface AiResponse<T> {
  output: T;
  rawText: string;
  usage: AiUsage;
  model: string;
  latencyMs: number;
  stopReason: string | null;
  costMicros: number;
  /** True when served from the provider's batch endpoint (half price). */
  batched: boolean;
}

export type AiBatchStatus = "in_progress" | "ended" | "canceling" | "unknown";

export interface AiBatchResult<T> {
  customId: string;
  result: { type: "succeeded"; response: AiResponse<T> } | { type: "errored"; error: string; retryable: boolean } | { type: "expired" } | { type: "canceled" };
}

export interface AiBatchHandle {
  batchId: string;
  requestCount: number;
}

export interface AiProvider {
  readonly name: "anthropic" | "mock";
  complete<T>(req: AiRequest<T>): Promise<AiResponse<T>>;
  /** Submit many requests at half price; results arrive later. */
  createBatch<T>(reqs: Array<AiRequest<T> & { customId: string }>): Promise<AiBatchHandle>;
  batchStatus(batchId: string): Promise<{ status: AiBatchStatus; counts: { processing: number; succeeded: number; errored: number; expired: number; canceled: number } }>;
  batchResults<T>(batchId: string, schema: z.ZodType<T>): AsyncIterable<AiBatchResult<T>>;
}
