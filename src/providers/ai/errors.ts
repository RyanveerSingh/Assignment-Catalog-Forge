export type AiErrorKind =
  | "rate_limit"
  | "overloaded"
  | "timeout"
  | "network"
  | "auth"
  | "billing"
  | "bad_request"
  | "refusal"
  | "invalid_json"
  | "max_tokens"
  | "unknown";

export interface AiErrorOptions {
  retryAfterMs?: number;
  status?: number;
  rawText?: string;
  cause?: unknown;
}

/**
 * Normalised provider failure. Job handlers map `kind` onto queue behaviour:
 * rate_limit/overloaded → pause the AI queue; auth/billing → pause the import; bad_request/refusal → no retry.
 */
export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly retryAfterMs: number | undefined;
  readonly status: number | undefined;
  readonly rawText: string | undefined;

  constructor(kind: AiErrorKind, message: string, options: AiErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AiError";
    this.kind = kind;
    this.retryAfterMs = options.retryAfterMs;
    this.status = options.status;
    this.rawText = options.rawText;
  }

  /** Whether another attempt could succeed without changing the request. */
  get retryable(): boolean {
    switch (this.kind) {
      case "rate_limit":
      case "overloaded":
      case "timeout":
      case "network":
      case "invalid_json":
      case "max_tokens":
      case "unknown":
        return true;
      case "auth":
      case "billing":
      case "bad_request":
      case "refusal":
        return false;
    }
  }
}

export function isAiError(err: unknown): err is AiError {
  return err instanceof AiError;
}
