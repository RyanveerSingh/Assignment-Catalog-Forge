import { describe, expect, it } from "vitest";
import { buildEnrichSystemPrompt, buildTranslateSystemPrompt, renderEnrichUserText, renderTranslateUserText, type EnrichInput, type TranslateInput } from "@/core/ai/prompts";
import { aiEnrichBatchSchema, aiTranslateBatchSchema } from "@/core/ai/schema";
import { AiError } from "./errors";
import { withChaos } from "./chaos";
import { createMockProvider } from "./mock";
import { costMicros, naiveCostMicros } from "./pricing";

const planter: EnrichInput = {
  products: [
    {
      product_key: "TC-PL",
      language: "en",
      source_title: "Terracotta Planter 20cm",
      source_description: "Hand-thrown planter with drainage hole.",
      category_hint: "Garden",
      brand: null,
      material: "terracotta",
      color: "natural",
      care: "Bring indoors below 0 °C",
      notes: "frost-resistant (not frost-proof, bring indoors below 0 °C)",
      tags: [],
      option_names: ["size"],
      option_values: { size: ["20 cm", "30 cm"] },
      variant_count: 2,
      attributes: {},
      photo_names: ["TC-PL-20.jpg"],
      rows: [
        { row: 14, cells: { Title: "Terracotta Planter 20cm", Notes: "frost-resistant (not frost-proof, bring indoors below 0 °C)", Description: "Hand-thrown planter with drainage hole." } },
        { row: 15, cells: { Title: "Terracotta Planter 30cm" } },
      ],
      issues: [],
    },
  ],
};

describe("mock AI provider", () => {
  it("writes a planter listing with a taxonomy category and cited claims", async () => {
    const provider = createMockProvider();
    const res = await provider.complete({
      purpose: "enrich",
      model: "mock-cheap",
      system: buildEnrichSystemPrompt(),
      userText: renderEnrichUserText(planter),
      input: planter,
      schema: aiEnrichBatchSchema,
      maxTokens: 4000,
    });
    const p = res.output.products[0]!;
    expect(p.product_key).toBe("TC-PL");
    expect(p.title).toBe("Terracotta Planter");
    expect(p.category).toBe("Home & Garden > Decor > Planters");
    expect(p.claims.map((c) => c.text)).toEqual(expect.arrayContaining(["hand-thrown", "frost-resistant"]));
    // Deliberately naive: the mock also claims frost-proof, which the grounding validator must strip.
    expect(p.claims.map((c) => c.text)).toContain("frost-proof");
    expect(p.claims.every((c) => c.source_row === 14 || c.source_row === 15)).toBe(true);
    expect(p.status).toBe("ok");
    expect(res.costMicros).toBe(0);
  });

  it("flags products with no usable title for review", async () => {
    const provider = createMockProvider();
    const input: EnrichInput = { products: [{ ...planter.products[0]!, product_key: "X", source_title: null, material: null, color: null, category_hint: null, source_description: null, rows: [] }] };
    const res = await provider.complete({ purpose: "enrich", model: "mock-cheap", system: "", userText: renderEnrichUserText(input), input, schema: aiEnrichBatchSchema, maxTokens: 1000 });
    expect(res.output.products[0]!.status).toBe("needs_review");
    expect(res.output.products[0]!.confidence.title).toBeLessThan(60);
  });

  it("translates while leaving sentinels and tags untouched", async () => {
    const provider = createMockProvider();
    const input: TranslateInput = {
      locale: "de",
      glossary: [],
      items: [{ id: "a", kind: "html", text: "<p>Terracotta planter with drainage hole ⟦1⟧.</p>" }],
    };
    const res = await provider.complete({ purpose: "translate", model: "mock-cheap", system: buildTranslateSystemPrompt(), userText: renderTranslateUserText(input), input, schema: aiTranslateBatchSchema, maxTokens: 1000 });
    const text = res.output.items[0]!.text;
    expect(text).toContain("⟦1⟧");
    expect(text.startsWith("<p>")).toBe(true);
    expect(text).toContain("Übertopf");
  });

  it("EC-D9: chaos wrapper injects a rate limit", async () => {
    const provider = withChaos(createMockProvider(), () => ({ rateLimitPct: 100, timeoutPct: 0, invalidJsonPct: 0 }));
    await expect(
      provider.complete({ purpose: "enrich", model: "mock-cheap", system: "", userText: "", input: planter, schema: aiEnrichBatchSchema, maxTokens: 10 }),
    ).rejects.toMatchObject({ kind: "rate_limit", retryAfterMs: 20_000 });
    expect(new AiError("auth", "x").retryable).toBe(false);
    expect(new AiError("overloaded", "x").retryable).toBe(true);
  });

  it("prices usage per model and computes the naive baseline", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    expect(costMicros("claude-haiku-5-5", usage)).toBe(100_000); // $0.10
    expect(costMicros("claude-haiku-5-5", usage, { batched: true })).toBe(50_000);
    expect(naiveCostMicros(usage)).toBe(2_000_000); // $2 on Sonnet
  });
});
