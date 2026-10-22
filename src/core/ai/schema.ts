import { z } from "zod";

/**
 * What the model is allowed to produce for a product. Deliberately contains NO prices, SKUs,
 * weights or dimensions: those are deterministic and never pass through the model.
 *
 * Kept to the JSON-schema subset that structured outputs accept: no records with arbitrary keys,
 * no numeric ranges, no defaults. Ranges and lengths are enforced afterwards in the validator.
 */

export const AI_LANGUAGES = ["en", "de", "fr", "other"] as const;

export const aiClaimSchema = z.object({
  /** The claim as it will appear in the listing, e.g. "frost-resistant". */
  text: z.string(),
  /** 1-based source row the claim comes from. */
  source_row: z.number().int(),
  /** Column header in that row. */
  source_column: z.string(),
  /** Verbatim snippet from that cell that supports the claim. */
  quote: z.string(),
});

export const aiAttributeSchema = z.object({
  name: z.string(),
  value: z.string(),
});

export const aiConfidenceSchema = z.object({
  title: z.number().int(),
  description: z.number().int(),
  category: z.number().int(),
  tags: z.number().int(),
  attributes: z.number().int(),
});

export const aiProductOutputSchema = z.object({
  /** Echo of the input key so batched outputs can be matched and mix-ups detected. */
  product_key: z.string(),
  title: z.string(),
  description_html: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  attributes: z.array(aiAttributeSchema),
  claims: z.array(aiClaimSchema),
  confidence: aiConfidenceSchema,
  status: z.enum(["ok", "needs_review"]),
  review_reason: z.string().nullable(),
  meta_title: z.string(),
  meta_description: z.string(),
  source_language: z.enum(AI_LANGUAGES),
});

export type AiProductOutput = z.infer<typeof aiProductOutputSchema>;
export type AiClaim = z.infer<typeof aiClaimSchema>;

export const aiEnrichBatchSchema = z.object({
  products: z.array(aiProductOutputSchema),
});
export type AiEnrichBatch = z.infer<typeof aiEnrichBatchSchema>;

export const aiTranslationItemSchema = z.object({
  id: z.string(),
  text: z.string(),
});

export const aiTranslateBatchSchema = z.object({
  items: z.array(aiTranslationItemSchema),
});
export type AiTranslateBatch = z.infer<typeof aiTranslateBatchSchema>;

/** Clamp a confidence to 0–100 after parsing (the schema itself cannot carry a range). */
export function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
