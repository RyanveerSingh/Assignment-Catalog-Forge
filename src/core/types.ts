/**
 * Shared domain types for the pure core (`src/core/**`).
 *
 * Rules: no I/O types here, no framework types, no classes. Everything is plain data
 * so it can be stored as JSON, passed between jobs, and asserted in tests.
 */

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

export type Severity = "info" | "warn" | "error";

/**
 * A problem or notable observation found while parsing, cleaning, grouping or validating.
 * Issues never stop processing by themselves; policies downstream decide what they mean
 * (for example an `error` on a required field makes a product `needs_review`).
 */
export interface Issue {
  /** Stable machine code, dotted: "price.ambiguous", "html.unsafe_removed", "sku.conflict". */
  code: string;
  severity: Severity;
  /** Human-readable English sentence, shown to the merchant. */
  message: string;
  /** Canonical field or raw column the issue belongs to, when there is one. */
  field?: string;
  /** Offending raw value, truncated to 200 characters. */
  value?: string;
  /** Source row number (1-based, as in the sheet) when the issue is row-scoped. */
  row?: number;
  /** EDGE-CASES.md id this issue corresponds to, e.g. "B5". Optional but encouraged. */
  ec?: string;
}

export const MAX_ISSUE_VALUE_LENGTH = 200;

/** Convenience for building issues with a truncated value. */
export function issue(
  code: string,
  severity: Severity,
  message: string,
  extra: Omit<Issue, "code" | "severity" | "message"> = {},
): Issue {
  const value =
    extra.value !== undefined && extra.value.length > MAX_ISSUE_VALUE_LENGTH
      ? `${extra.value.slice(0, MAX_ISSUE_VALUE_LENGTH)}…`
      : extra.value;
  return { code, severity, message, ...extra, ...(value !== undefined ? { value } : {}) };
}

// ---------------------------------------------------------------------------
// Money, units, language
// ---------------------------------------------------------------------------

/** ISO 4217 code, uppercase, three letters. */
export type CurrencyCode = string;

export interface Money {
  /** Integer minor units. Never a float. */
  cents: number;
  currency: CurrencyCode;
}

export type CurrencySource = "value" | "column" | "header" | "default" | "none";

export interface ParsedPrice {
  /** null when missing or unparseable; see issues for why. */
  money: Money | null;
  /** 0–100. 100 = unambiguous value with explicit currency. */
  confidence: number;
  currencySource: CurrencySource;
  issues: Issue[];
  raw: string;
}

export interface Dimensions {
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  /** Diameter for round items ("Ø 20 cm"). */
  diameterCm?: number;
}

export interface ParsedLength {
  cm: number;
  /** True when no unit was present and cm was assumed (EC-B7). */
  assumed: boolean;
  issues: Issue[];
}

export interface ParsedWeight {
  grams: number;
  assumed: boolean;
  issues: Issue[];
}

export interface ParsedDimensions {
  dims: Dimensions;
  assumed: boolean;
  issues: Issue[];
}

/** ISO 639-1 where known; "und" when undetermined. */
export type Lang = "en" | "de" | "fr" | "und";

export interface DetectedLanguage {
  lang: Lang;
  /** 0–100 */
  confidence: number;
}

// ---------------------------------------------------------------------------
// Columns and raw rows
// ---------------------------------------------------------------------------

/**
 * Canonical fields a supplier column can map to. Anything unmapped is kept as a raw attribute.
 * Keep this list small and stable; the synonym dictionary in `core/parse/headers.ts` maps
 * real-world headers (EN/DE/FR) onto it.
 */
export const CANONICAL_FIELDS = [
  "sku",
  "parent_sku",
  "handle",
  "title",
  "description",
  "category",
  "brand",
  "vendor",
  "price",
  "compare_at_price",
  "cost",
  "currency",
  "variant", // a single combined column like "20cm / Blue"
  "option_size",
  "option_color",
  "option_material",
  "color", // colour as an attribute rather than a variant option; cleaner decides
  "material",
  "size",
  "quantity",
  "weight",
  "length",
  "width",
  "height",
  "diameter",
  "dimensions",
  "image",
  "images",
  "tags",
  "notes",
  "care",
  "barcode",
  "country_of_origin",
] as const;

export type CanonicalField = (typeof CANONICAL_FIELDS)[number];

export type MappingMethod = "exact" | "synonym" | "fuzzy" | "content" | "none";

export interface ColumnMapping {
  /** Original header text, after de-duplication suffixing ("price", "price_2"). */
  header: string;
  /** Header text exactly as it appeared in the file. */
  originalHeader: string;
  /** 0-based column index in the sheet. */
  index: number;
  /** null = unmapped; the column is kept as an attribute named by `header`. */
  canonical: CanonicalField | null;
  /** 0–100 */
  confidence: number;
  via: MappingMethod;
}

/** One sheet row as text cells keyed by (de-duplicated) header. */
export interface RawRow {
  /** 1-based data row number as the merchant would count it in the sheet (header excluded). */
  rowNumber: number;
  cells: Record<string, string>;
}

export interface ParsedSheet {
  headers: string[];
  originalHeaders: string[];
  /** 0-based index of the header row within the file, for the import log. */
  headerRowIndex: number;
  rows: RawRow[];
  /** Total data rows found in the file, including any beyond the cap. */
  totalRows: number;
  /** True when rows beyond the cap were dropped (EC-A14). */
  truncated: boolean;
  format: "csv" | "xlsx" | "xls" | "sql";
  encoding?: string;
  delimiter?: string;
  sheetName?: string;
  issues: Issue[];
}

// ---------------------------------------------------------------------------
// Cleaned rows
// ---------------------------------------------------------------------------

export interface CleanedRow {
  rowNumber: number;
  /** Normalised identity (trimmed, uppercased). null when the sheet had no usable SKU. */
  sku: string | null;
  /** SKU as the supplier wrote it, for display. */
  skuDisplay: string | null;
  /** Explicit grouping key from a parent_sku or handle column, normalised. */
  parentKey: string | null;
  title: string | null;
  /** Sanitised HTML (allowlist) or null. */
  descriptionHtml: string | null;
  /** Plain-text version of the description for the model and the grounding corpus. */
  descriptionText: string | null;
  category: string | null;
  brand: string | null;
  price: ParsedPrice | null;
  compareAtPrice: ParsedPrice | null;
  /** Normalised option name → normalised value, e.g. { size: "20 cm", color: "terracotta" }. */
  options: Record<string, string>;
  /** Product-level colour (normalised) when the sheet treats colour as an attribute, not an option. */
  color: string | null;
  weightGrams: number | null;
  dimensions: Dimensions | null;
  /** Filenames or URLs referenced by the row, in order. */
  images: string[];
  tags: string[];
  notes: string | null;
  care: string | null;
  material: string | null;
  quantity: number | null;
  barcode: string | null;
  /** Unmapped columns, cleaned, keyed by header. */
  attributes: Record<string, string>;
  language: DetectedLanguage;
  issues: Issue[];
  /** sha256 hex of the normalised raw cells; identical rows share a hash (EC-C3). */
  rowHash: string;
  /**
   * "column: value" lines for every non-empty raw cell. This is the grounding corpus the
   * validator checks claims and numbers against, and what the model is shown.
   */
  sourceText: string;
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export type ProductKeySource = "parent" | "handle" | "sku_stem" | "title" | "single_row";

export interface VariantDraft {
  sku: string;
  skuDisplay: string;
  /** True when the SKU was generated because the source had none (EC-C6). */
  synthetic: boolean;
  options: Record<string, string>;
  priceCents: number | null;
  currency: CurrencyCode | null;
  compareAtCents: number | null;
  weightGrams: number | null;
  dimensions: Dimensions | null;
  images: string[];
  quantity: number | null;
  barcode: string | null;
  sourceRows: number[];
  issues: Issue[];
}

export interface DuplicateRow {
  row: number;
  of: number;
}

export interface ProductGroup {
  /** Deterministic within a store: same input rows → same key, across re-uploads. */
  productKey: string;
  keySource: ProductKeySource;
  /** Best source title (deterministic choice: most frequent, then longest, then first). */
  title: string | null;
  descriptionHtml: string | null;
  descriptionText: string | null;
  category: string | null;
  brand: string | null;
  tags: string[];
  notes: string | null;
  care: string | null;
  material: string | null;
  /** Colour when it is a product attribute rather than a variant option. */
  color: string | null;
  attributes: Record<string, string>;
  variants: VariantDraft[];
  /** Source rows that contributed, excluding exact duplicates. */
  sourceRows: number[];
  duplicateRows: DuplicateRow[];
  /** Conflicts such as the same SKU with two different prices (EC-C4). */
  conflicts: Issue[];
  issues: Issue[];
  language: DetectedLanguage;
  images: string[];
  /** All contributing rows' `sourceText`, joined with blank lines. */
  sourceCorpus: string;
  /** 0–100; higher = messier. Drives model routing. */
  complexity: number;
  /** sha256 hex over the normalised inputs; unchanged hash = AI cache hit (EC-D20). */
  sourceHash: string;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export type PhotoMatchMethod = "image_column" | "sku" | "sku_token" | "sku_stem" | "handle" | "fuzzy" | "none";

export interface PhotoMatch {
  filename: string;
  productKey: string | null;
  /** Variant SKU when the match is variant-specific. */
  sku: string | null;
  /** 0-based display order within the product. */
  position: number;
  method: PhotoMatchMethod;
  /** 0–100 */
  score: number;
}

// ---------------------------------------------------------------------------
// Ground truth for the evaluation harness (generated alongside synthetic samples)
// ---------------------------------------------------------------------------

export interface GroundTruthVariant {
  sku: string;
  options: Record<string, string>;
  priceCents: number | null;
  currency: CurrencyCode | null;
  weightGrams: number | null;
}

export type GroundTruthStatus = "done" | "needs_review";

export interface GroundTruthProduct {
  productKey: string;
  /** Words that must appear in an acceptable title (lower-case). */
  titleKeywords: string[];
  /** Expected category path prefix, e.g. "Home & Garden > Planters". */
  categoryPrefix: string;
  variants: GroundTruthVariant[];
  /** Claims the source supports (lower-case). Anything else in the output is an invention. */
  allowedClaims: string[];
  /** Claims the source explicitly negates (lower-case). Asserting one is a hard error. */
  negatedClaims: string[];
  expectedStatus: GroundTruthStatus;
  /** Reason classes when expectedStatus is needs_review: "no_price", "sku_conflict", … */
  expectedReviewReasons: string[];
  sourceRows: number[];
  /** Filenames of photos that belong to this product. */
  photos: string[];
  /** Source language of the rows. */
  language: Lang;
}

export interface GroundTruthFile {
  sample: string;
  generatedAt: string;
  seed: number;
  products: GroundTruthProduct[];
  /** Filenames in the photo ZIP that match no product. */
  unmatchedPhotos: string[];
  /** Row numbers that are exact duplicates of an earlier row. */
  duplicateRows: DuplicateRow[];
}
