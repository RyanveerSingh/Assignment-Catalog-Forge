import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { AiError } from "./errors";
import { costMicros } from "./pricing";
import type { AiBatchHandle, AiBatchResult, AiBatchStatus, AiProvider, AiRequest, AiResponse, AiUsage } from "./types";

/**
 * Anthropic Messages API + Message Batches API.
 * Retries are deliberately disabled in the SDK (`maxRetries: 0`): the job queue owns retry policy
 * so that a 429 pauses the whole queue instead of being retried blindly per request.
 */
export function createAnthropicProvider(apiKey: string): AiProvider {
  const client = new Anthropic({ apiKey, maxRetries: 0 });

  function buildParams<T>(req: AiRequest<T>): Anthropic.MessageCreateParamsNonStreaming {
    const content: Anthropic.ContentBlockParam[] = [];
    for (const img of req.images ?? []) {
      content.push({ type: "image", source: { type: "base64", media_type: img.mime, data: img.base64 } });
    }
    content.push({ type: "text", text: req.userText });
    return {
      model: req.model,
      max_tokens: req.maxTokens,
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
      output_config: {
        format: zodOutputFormat(req.schema),
        ...(req.effort ? { effort: req.effort } : {}),
      },
    };
  }

  function usageOf(u: Anthropic.Usage | null | undefined): AiUsage {
    return {
      inputTokens: u?.input_tokens ?? 0,
      outputTokens: u?.output_tokens ?? 0,
      cacheReadTokens: u?.cache_read_input_tokens ?? 0,
      cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
    };
  }

  function textOf(message: Anthropic.Message): string {
    return message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  function parseWithSchema<T>(message: Anthropic.Message, schema: z.ZodType<T>, model: string, latencyMs: number, batched: boolean): AiResponse<T> {
    const rawText = textOf(message);
    const usage = usageOf(message.usage);
    if (message.stop_reason === "refusal") {
      throw new AiError("refusal", "The model declined this request", { rawText });
    }
    if (message.stop_reason === "max_tokens") {
      throw new AiError("max_tokens", "Output was cut off at max_tokens", { rawText });
    }
    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch (err) {
      throw new AiError("invalid_json", "Model output was not valid JSON", { rawText, cause: err });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new AiError("invalid_json", `Model output did not match the schema: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, { rawText });
    }
    return {
      output: parsed.data,
      rawText,
      usage,
      model,
      latencyMs,
      stopReason: message.stop_reason,
      costMicros: costMicros(model, usage, { batched }),
      batched,
    };
  }

  return {
    name: "anthropic",

    async complete<T>(req: AiRequest<T>): Promise<AiResponse<T>> {
      const started = Date.now();
      let message: Anthropic.Message;
      try {
        message = await client.messages.create(buildParams(req), { timeout: req.timeoutMs ?? 60_000 });
      } catch (err) {
        throw mapError(err);
      }
      return parseWithSchema(message, req.schema, req.model, Date.now() - started, false);
    },

    async createBatch<T>(reqs: Array<AiRequest<T> & { customId: string }>): Promise<AiBatchHandle> {
      try {
        const batch = await client.messages.batches.create({
          requests: reqs.map((r) => ({ custom_id: r.customId, params: buildParams(r) })),
        });
        return { batchId: batch.id, requestCount: reqs.length };
      } catch (err) {
        throw mapError(err);
      }
    },

    async batchStatus(batchId: string) {
      try {
        const b = await client.messages.batches.retrieve(batchId);
        const status: AiBatchStatus =
          b.processing_status === "ended" ? "ended" : b.processing_status === "canceling" ? "canceling" : b.processing_status === "in_progress" ? "in_progress" : "unknown";
        return {
          status,
          counts: {
            processing: b.request_counts.processing,
            succeeded: b.request_counts.succeeded,
            errored: b.request_counts.errored,
            expired: b.request_counts.expired,
            canceled: b.request_counts.canceled,
          },
        };
      } catch (err) {
        throw mapError(err);
      }
    },

    async *batchResults<T>(batchId: string, schema: z.ZodType<T>): AsyncIterable<AiBatchResult<T>> {
      let stream: Awaited<ReturnType<typeof client.messages.batches.results>>;
      try {
        stream = await client.messages.batches.results(batchId);
      } catch (err) {
        throw mapError(err);
      }
      for await (const item of stream) {
        const customId = item.custom_id;
        const r = item.result;
        if (r.type === "succeeded") {
          try {
            yield { customId, result: { type: "succeeded", response: parseWithSchema(r.message, schema, r.message.model, 0, true) } };
          } catch (err) {
            const e = err instanceof AiError ? err : new AiError("unknown", String(err));
            yield { customId, result: { type: "errored", error: e.message, retryable: e.retryable } };
          }
        } else if (r.type === "errored") {
          const inner = r.error.error;
          const retryable = inner.type !== "invalid_request_error" && inner.type !== "authentication_error" && inner.type !== "permission_error" && inner.type !== "billing_error";
          yield { customId, result: { type: "errored", error: `${inner.type}: ${inner.message}`, retryable } };
        } else if (r.type === "expired") {
          yield { customId, result: { type: "expired" } };
        } else {
          yield { customId, result: { type: "canceled" } };
        }
      }
    },
  };
}

/** Translate SDK exceptions into AiError kinds. Order matters: most specific first. */
export function mapError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.RateLimitError) {
    const header = err.headers?.get?.("retry-after");
    const seconds = header ? Number(header) : NaN;
    const retryAfterMs = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 60_000;
    return new AiError("rate_limit", "Rate limited by the AI provider", { retryAfterMs, status: 429, cause: err });
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AiError("auth", "The AI API key was rejected", { status: err.status, cause: err });
  }
  if (err instanceof Anthropic.BadRequestError) {
    if (/credit balance|billing|payment/i.test(err.message)) {
      return new AiError("billing", "The AI account has no credit left", { status: 400, cause: err });
    }
    return new AiError("bad_request", `Bad request to the AI provider: ${err.message}`, { status: 400, cause: err });
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiError("timeout", "AI request timed out", { cause: err });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError("network", "Could not reach the AI provider", { cause: err });
  }
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529 || (err.status !== undefined && err.status >= 500)) {
      return new AiError("overloaded", `AI provider error ${err.status}`, { status: err.status, retryAfterMs: 30_000, cause: err });
    }
    return new AiError("unknown", `AI provider error ${err.status ?? ""}: ${err.message}`, { status: err.status, cause: err });
  }
  if (err instanceof Error && /abort|timeout/i.test(err.message)) {
    return new AiError("timeout", err.message, { cause: err });
  }
  return new AiError("unknown", err instanceof Error ? err.message : String(err), { cause: err });
}
