import { describe, expect, it } from "vitest";
import { parseArgs, runEval } from "./run";

describe("eval harness (smoke)", () => {
  it("runs tiny-10 through the mock provider and scores it in under 20 s", async () => {
    const started = Date.now();
    const result = await runEval({ sample: "tiny-10", provider: "mock", limit: 4, outDir: null, quiet: true });
    expect(Date.now() - started).toBeLessThan(20_000);
    expect(result.config.provider).toBe("mock");
    expect(result.counts.calls).toBeGreaterThan(0);
    expect(result.metrics.productRecall).toBeGreaterThan(0);
    expect(result.metrics.negatedViolations).toBe(0);
    expect(result.outFile).toBeNull();
  });

  it("parses the documented flags", () => {
    expect(parseArgs(["--sample", "messy-120", "--provider=mock", "--tier", "cheap", "--limit", "5", "--store"])).toEqual({ sample: "messy-120", provider: "mock", tier: "cheap", limit: 5, store: true });
    expect(parseArgs(["--store=0d3d3a9e-0000-4000-8000-000000000000"]).store).toBe("0d3d3a9e-0000-4000-8000-000000000000");
    expect(() => parseArgs(["--limit", "0"])).toThrow(/positive integer/);
    expect(() => parseArgs(["--provider", "openai"])).toThrow(/mock or anthropic/);
    expect(() => parseArgs(["--bogus"])).toThrow(/unknown argument/);
  });
});
