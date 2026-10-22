/**
 * Shapes shared by the runner, the report and the stored JSON. Kept apart from `metrics.ts` so the
 * scoring stays free of CLI concerns.
 */
import type { AiTier } from "@/core/ai/routing";
import type { DuplicateRow, ProductKeySource } from "@/core/types";
import type { EvalMetrics, PairScore } from "./metrics";

export type EvalProvider = "mock" | "anthropic";
export type EvalTier = "auto" | "cheap" | "strong";

export interface EvalOptions {
  sample: string;
  provider?: EvalProvider;
  /** Prompt version passed to the system prompt builder. */
  prompt?: string;
  /** "auto" routes per product like the pipeline; "cheap" or "strong" forces one tier. */
  tier?: EvalTier;
  /** Only the first N products in sheet order; the ground truth is narrowed to the same rows. */
  limit?: number;
  /** Insert a row into eval_runs; a string is the store id to file it under (true = no store). */
  store?: boolean | string;
  /** Directory for the JSON report; null skips the file. Default eval/out. */
  outDir?: string | null;
  quiet?: boolean;
}

export interface CallRecord {
  batch: string;
  tier: AiTier;
  model: string;
  products: number;
  attempt: number;
  ok: boolean;
  error: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: number;
  latencyMs: number;
}

export interface CostSummary {
  calls: number;
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: number;
  costUsd: number;
  /** Sum of model latency over every attempt. */
  modelLatencyMs: number;
  meanLatencyMs: number | null;
  /** Parse + clean + group, before any model call. */
  pipelineMs: number;
  elapsedMs: number;
}

export interface EvalConfig {
  sample: string;
  file: string;
  provider: EvalProvider;
  requestedProvider: EvalProvider;
  models: string[];
  /** Models actually used, joined with "+" when routing mixed tiers. */
  model: string;
  promptVersion: string;
  tier: EvalTier;
  limit: number | null;
  defaultCurrency: string;
  startedAt: string;
  note: string | null;
}

export interface EvalRunResult {
  config: EvalConfig;
  counts: { rows: number; derivedProducts: number; truthProducts: number; matched: number; failedProducts: number; calls: number };
  metrics: EvalMetrics;
  products: PairScore[];
  routing: Array<{ productKey: string; keySource: ProductKeySource; complexity: number; tier: AiTier; model: string }>;
  unmatchedTruth: Array<{ productKey: string; skus: string[] }>;
  unmatchedDerived: Array<{ productKey: string; skus: string[]; title: string; error: string | null }>;
  duplicates: { derived: DuplicateRow[]; truth: DuplicateRow[]; missed: DuplicateRow[]; extra: DuplicateRow[] };
  calls: CallRecord[];
  cost: CostSummary;
  outFile: string | null;
  evalRunId: string | null;
}
