import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Delivery signatures (EC-I7). HMAC-SHA256 over `${timestamp}.${body}` with the webhook's secret,
 * sent as `X-CatalogForge-Signature: sha256=<hex>`. The timestamp is part of the signed string so a
 * captured delivery cannot be replayed later with a fresh timestamp.
 */

export const SIGNATURE_PREFIX = "sha256=";

export function signPayload(secret: string, timestamp: number | string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signatureHeader(secret: string, timestamp: number | string, body: string): string {
  return `${SIGNATURE_PREFIX}${signPayload(secret, timestamp, body)}`;
}

/**
 * Constant-time check of a received signature (with or without the `sha256=` prefix) against the
 * body as delivered. Any malformed input is simply "not valid"; nothing here throws.
 */
export function verifySignature(secret: string, timestamp: number | string, body: string, signature: string): boolean {
  const presented = signature.startsWith(SIGNATURE_PREFIX) ? signature.slice(SIGNATURE_PREFIX.length) : signature;
  if (!/^[0-9a-f]{64}$/i.test(presented)) return false;
  const expected = Buffer.from(signPayload(secret, timestamp, body), "hex");
  const actual = Buffer.from(presented.toLowerCase(), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
