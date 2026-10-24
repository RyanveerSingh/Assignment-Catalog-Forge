import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { mapError } from "./anthropic";

function apiError(status: number, type: string, message = "boom"): unknown {
  return Anthropic.APIError.generate(status, { type: "error", error: { type, message } }, message, new Headers());
}

describe("mapError", () => {
  it.each([
    [529, "overloaded_error", "overloaded"],
    [500, "api_error", "unknown"],
    [502, "api_error", "unknown"],
    [503, "api_error", "unknown"],
    [504, "api_error", "unknown"],
  ])("EC-D10: HTTP %i (%s) maps to %s", (status, type, kind) => {
    const err = mapError(apiError(status, type));
    expect(err.kind).toBe(kind);
    expect(err.status).toBe(status);
    expect(err.retryable).toBe(true);
  });

  it("EC-D10: only 529 carries a pause hint; a plain 5xx retries with normal backoff", () => {
    expect(mapError(apiError(529, "overloaded_error")).retryAfterMs).toBe(30_000);
    expect(mapError(apiError(500, "api_error")).retryAfterMs).toBeUndefined();
  });

  it("EC-D9: 429 is a rate limit with the retry-after hint", () => {
    const headers = new Headers({ "retry-after": "12" });
    const err = mapError(Anthropic.APIError.generate(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, "slow down", headers));
    expect(err.kind).toBe("rate_limit");
    expect(err.retryAfterMs).toBe(12_000);
  });

  it("EC-D11: 400 is a non-retryable bad request", () => {
    const err = mapError(apiError(400, "invalid_request_error", "prompt is too long"));
    expect(err.kind).toBe("bad_request");
    expect(err.retryable).toBe(false);
  });
});
