import { describe, expect, it } from "vitest";
import { buildDeliveryHeaders, classifyDeliveryResult, MAX_DELIVERY_ATTEMPTS, responseSnippet, RESPONSE_SNIPPET_CHARS } from "./delivery";
import { verifySignature } from "./signature";

const SECRET = "whsec_abc";
const BODY = '{"event":"webhook.test","id":"webhook.test:1"}';

describe("buildDeliveryHeaders (EC-I7)", () => {
  it("EC-I7: sends the event, delivery id, timestamp and a signature the receiver can verify", () => {
    const headers = buildDeliveryHeaders({ secret: SECRET, event: "webhook.test", deliveryId: "d-1", body: BODY, timestamp: 1_761_213_600 });
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["User-Agent"]).toBe("CatalogForge-Webhooks/1");
    expect(headers["X-CatalogForge-Event"]).toBe("webhook.test");
    expect(headers["X-CatalogForge-Delivery"]).toBe("d-1");
    expect(headers["X-CatalogForge-Timestamp"]).toBe("1761213600");
    expect(headers["X-CatalogForge-Signature"]).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifySignature(SECRET, headers["X-CatalogForge-Timestamp"], BODY, headers["X-CatalogForge-Signature"])).toBe(true);
  });
});

describe("classifyDeliveryResult (EC-I9)", () => {
  const cases: Array<[string, Parameters<typeof classifyDeliveryResult>[0], "delivered" | "retry" | "failed"]> = [
    ["200 is delivered", { kind: "response", status: 200, bodySnippet: "ok" }, "delivered"],
    ["204 is delivered", { kind: "response", status: 204, bodySnippet: "" }, "delivered"],
    ["301 is a failure, never followed", { kind: "response", status: 301, bodySnippet: "" }, "failed"],
    ["307 is a failure, never followed", { kind: "response", status: 307, bodySnippet: "" }, "failed"],
    ["400 fails without retry", { kind: "response", status: 400, bodySnippet: "bad request" }, "failed"],
    ["401 fails without retry", { kind: "response", status: 401, bodySnippet: "" }, "failed"],
    ["404 fails without retry", { kind: "response", status: 404, bodySnippet: "" }, "failed"],
    ["408 is retried", { kind: "response", status: 408, bodySnippet: "" }, "retry"],
    ["429 is retried", { kind: "response", status: 429, bodySnippet: "slow down" }, "retry"],
    ["500 is retried", { kind: "response", status: 500, bodySnippet: "boom" }, "retry"],
    ["503 is retried", { kind: "response", status: 503, bodySnippet: "" }, "retry"],
    ["a timeout is retried", { kind: "timeout" }, "retry"],
    ["a connection error is retried", { kind: "network", message: "ECONNREFUSED 127.0.0.1:9" }, "retry"],
  ];

  it.each(cases)("EC-I9: %s", (_name, result, outcome) => {
    expect(classifyDeliveryResult(result).outcome).toBe(outcome);
  });

  it("EC-I9: the delivery log gets the status and the receiver's answer, nothing on success", () => {
    expect(classifyDeliveryResult({ kind: "response", status: 200, bodySnippet: "ok" }).error).toBeNull();
    expect(classifyDeliveryResult({ kind: "response", status: 500, bodySnippet: "boom" }).error).toBe("HTTP 500: boom");
    expect(classifyDeliveryResult({ kind: "response", status: 404, bodySnippet: "" }).error).toBe("HTTP 404");
    expect(classifyDeliveryResult({ kind: "response", status: 302, bodySnippet: "" }).error).toMatch(/redirects are not followed/);
    expect(classifyDeliveryResult({ kind: "timeout" }).error).toMatch(/10 s/);
    expect(classifyDeliveryResult({ kind: "network", message: "ECONNREFUSED" }).error).toBe("Could not connect: ECONNREFUSED");
  });

  it("EC-I9: five attempts in total", () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(5);
  });
});

describe("responseSnippet", () => {
  it("is single-line, printable and bounded", () => {
    expect(responseSnippet("  line one\n\n\tline\u0000 two \u001b[31mred\u001b[0m  ")).toBe("line one line two [31mred[0m");
    expect(responseSnippet("x".repeat(5_000))).toHaveLength(RESPONSE_SNIPPET_CHARS);
    expect(responseSnippet("")).toBe("");
  });
});
