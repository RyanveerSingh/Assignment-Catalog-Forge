import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signatureHeader, signPayload, verifySignature } from "./signature";

const SECRET = "whsec_test_secret_0123456789";
const BODY = '{"event":"import.completed","id":"import.completed:abc","import":{"totalRows":120}}';
const TS = 1_761_213_600;

describe("webhook signatures (EC-I7)", () => {
  it("EC-I7: signs `${timestamp}.${body}` with HMAC-SHA256, hex encoded", () => {
    const expected = createHmac("sha256", SECRET).update(`${TS}.${BODY}`).digest("hex");
    expect(signPayload(SECRET, TS, BODY)).toBe(expected);
    expect(signPayload(SECRET, String(TS), BODY)).toBe(expected);
    expect(signatureHeader(SECRET, TS, BODY)).toBe(`sha256=${expected}`);
  });

  it("EC-I7: a receiver can verify the header with or without the sha256= prefix, in any hex case", () => {
    const header = signatureHeader(SECRET, TS, BODY);
    expect(verifySignature(SECRET, TS, BODY, header)).toBe(true);
    expect(verifySignature(SECRET, TS, BODY, header.slice("sha256=".length))).toBe(true);
    expect(verifySignature(SECRET, TS, BODY, header.toUpperCase().replace("SHA256=", "sha256="))).toBe(true);
  });

  it.each([
    ["a different secret", (h: string) => ({ secret: "whsec_other", ts: TS, body: BODY, sig: h })],
    ["a tampered body", (h: string) => ({ secret: SECRET, ts: TS, body: BODY.replace("120", "121"), sig: h })],
    ["a replayed timestamp", (h: string) => ({ secret: SECRET, ts: TS + 1, body: BODY, sig: h })],
    ["a flipped signature byte", (h: string) => ({ secret: SECRET, ts: TS, body: BODY, sig: h.slice(0, -1) + (h.endsWith("0") ? "1" : "0") })],
    ["a truncated signature", (h: string) => ({ secret: SECRET, ts: TS, body: BODY, sig: h.slice(0, 20) })],
    ["an empty signature", () => ({ secret: SECRET, ts: TS, body: BODY, sig: "" })],
    ["a non-hex signature of the right length", () => ({ secret: SECRET, ts: TS, body: BODY, sig: `sha256=${"zz".repeat(32)}` })],
  ])("EC-I7: %s is rejected without throwing", (_name, make) => {
    const header = signatureHeader(SECRET, TS, BODY);
    const { secret, ts, body, sig } = make(header);
    expect(verifySignature(secret, ts, body, sig)).toBe(false);
  });

  it("EC-I7: the signature covers the exact bytes sent; re-serialising the JSON with different spacing breaks it", () => {
    const header = signatureHeader(SECRET, TS, BODY);
    const pretty = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifySignature(SECRET, TS, pretty, header)).toBe(false);
  });
});
