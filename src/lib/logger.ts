import pino, { type Logger } from "pino";

let root: Logger | null = null;

/**
 * Structured JSON logger. Child loggers carry correlation ids (importId, jobId, requestId)
 * so a failed import can be traced end to end (EC-J4).
 */
export function getLogger(bindings: Record<string, unknown> = {}): Logger {
  if (!root) {
    root = pino({
      level: process.env.LOG_LEVEL ?? "info",
      base: { service: process.env.WORKER_MODE === "separate" ? "worker" : "web" },
      redact: {
        paths: ["apiKey", "*.apiKey", "authorization", "*.authorization", "ANTHROPIC_API_KEY"],
        censor: "[redacted]",
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }
  return Object.keys(bindings).length ? root.child(bindings) : root;
}
