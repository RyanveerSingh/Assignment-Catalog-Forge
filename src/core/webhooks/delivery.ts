import { signatureHeader } from "./signature";

/**
 * The pure half of a delivery (EC-I9): which headers go out, and what a response means for the
 * queue. The job in `src/jobs/webhook.ts` does the network call and persists the verdict.
 */

export const DELIVERY_TIMEOUT_MS = 10_000;
/** How much of the receiver's answer is read; enough for an error message, never a page. */
export const MAX_RESPONSE_BYTES = 4 * 1024;
export const RESPONSE_SNIPPET_CHARS = 500;
/** 5 attempts with the queue's 2s·2^n backoff: roughly 2 s, 4 s, 8 s, 16 s between tries. */
export const MAX_DELIVERY_ATTEMPTS = 5;
export const WEBHOOK_USER_AGENT = "CatalogForge-Webhooks/1";

export interface DeliveryHeadersInput {
  secret: string;
  event: string;
  deliveryId: string;
  body: string;
  /** Unix seconds; the receiver compares it to its clock to refuse stale deliveries. */
  timestamp: number;
}

export function buildDeliveryHeaders(input: DeliveryHeadersInput): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "User-Agent": WEBHOOK_USER_AGENT,
    "X-CatalogForge-Event": input.event,
    "X-CatalogForge-Delivery": input.deliveryId,
    "X-CatalogForge-Timestamp": String(input.timestamp),
    "X-CatalogForge-Signature": signatureHeader(input.secret, input.timestamp, input.body),
  };
}

export type DeliveryResult = { kind: "response"; status: number; bodySnippet: string } | { kind: "timeout" } | { kind: "network"; message: string };

export interface DeliveryVerdict {
  outcome: "delivered" | "retry" | "failed";
  /** What the delivery log shows; null when delivered. */
  error: string | null;
}

/** 408 and 429 are the two 4xx codes that mean "later", not "never". */
const RETRYABLE_4XX = new Set([408, 429]);

export function classifyDeliveryResult(result: DeliveryResult): DeliveryVerdict {
  if (result.kind === "timeout") return { outcome: "retry", error: `No response within ${DELIVERY_TIMEOUT_MS / 1000} s` };
  if (result.kind === "network") return { outcome: "retry", error: `Could not connect: ${responseSnippet(result.message) || "network error"}` };
  const { status } = result;
  const detail = result.bodySnippet ? `HTTP ${status}: ${result.bodySnippet}` : `HTTP ${status}`;
  if (status >= 200 && status < 300) return { outcome: "delivered", error: null };
  // Redirects are never followed: a webhook that moved must be re-registered at its new URL.
  if (status >= 300 && status < 400) return { outcome: "failed", error: `HTTP ${status}: redirects are not followed; register the final URL` };
  if (status >= 500 || RETRYABLE_4XX.has(status)) return { outcome: "retry", error: detail };
  return { outcome: "failed", error: detail };
}

/** A bounded, single-line, printable excerpt of a response body for the delivery log. */
export function responseSnippet(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, RESPONSE_SNIPPET_CHARS);
}
