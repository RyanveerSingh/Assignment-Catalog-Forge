import type { QueueName } from "@/db/schema";

export interface JobErrorOptions {
  /** false = do not retry, mark the job dead immediately (bad input, refusal, 400). */
  retryable?: boolean;
  /** Override the exponential backoff for the next attempt. */
  retryAfterMs?: number;
  /** Pause a whole queue (rate limit, provider down, bad API key). The job is re-queued without consuming an attempt. */
  pauseQueue?: { queue: QueueName; untilMs: number; reason: string };
  cause?: unknown;
}

/**
 * Thrown by job handlers to tell the worker loop how to treat a failure.
 * Any other thrown error is treated as retryable with default backoff.
 */
export class JobError extends Error {
  readonly retryable: boolean;
  readonly retryAfterMs: number | undefined;
  readonly pauseQueue: JobErrorOptions["pauseQueue"];

  constructor(message: string, options: JobErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "JobError";
    this.retryable = options.retryable ?? true;
    this.retryAfterMs = options.retryAfterMs;
    this.pauseQueue = options.pauseQueue;
  }
}

export function isJobError(err: unknown): err is JobError {
  return err instanceof JobError;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
