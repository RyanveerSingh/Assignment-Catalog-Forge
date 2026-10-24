import type { Issue, ProductGroup } from "@/core/types";
import type { AiProductOutput } from "./schema";

/** Data types shared by the grounding validator's steps; `grounding.ts` re-exports them. */

export interface GroundingInput {
  output: AiProductOutput;
  group: ProductGroup;
  rows: Array<{ row: number; cells: Record<string, string> }>;
}

export interface GroundedContent {
  title: string;
  descriptionHtml: string | null;
  category: string;
  tags: string[];
  attributes: Record<string, string>;
  seo: { metaTitle: string | null; metaDescription: string | null };
}

export interface VerifiedClaim {
  text: string;
  source: string;
  row: number;
  column: string;
  quote: string;
  verified: boolean;
}

/** unsupported: nowhere in the source. negated: the source says "not X". contradicted: the listing says "not X", the source says X. */
export type BlockedKind = "unsupported" | "negated" | "contradicted";

/** A claim the validator removed or a lexicon term it stripped from the text; shown as a guardrail in the review drawer. */
export interface BlockedClaim {
  text: string;
  kind: BlockedKind;
  reason: string;
  /** Canonical lexicon term, when the block came from the lexicon sweep. */
  term?: string;
  /** The source cell holding the negation or the assertion the listing contradicts; absent when nothing was found. */
  row?: number;
  column?: string;
  quote?: string;
}

export interface GroundingResult {
  content: GroundedContent;
  claims: VerifiedClaim[];
  blocked: BlockedClaim[];
  confidence: Record<string, number>;
  reviewReasons: string[];
  status: "draft" | "needs_review";
  issues: Issue[];
}
