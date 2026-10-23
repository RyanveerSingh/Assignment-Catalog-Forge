import type { BlockedClaim } from "@/core/ai/grounding";
import type { CleaningXrayEntry } from "@/core/clean/xray";
import type { DuplicateRow, Issue, ProductGroup } from "@/core/types";

/**
 * Wire shapes of the products API as the browser sees them (JSON: dates are ISO strings).
 * Declared here rather than imported from src/db so client bundles never touch the database layer.
 * The core imports are type-only, so no server code reaches the bundle either.
 */

export type ProductStatus = "pending_ai" | "draft" | "needs_review" | "approved" | "rejected" | "archived" | "failed";

export const PRODUCT_STATUSES: ReadonlyArray<ProductStatus> = ["pending_ai", "draft", "needs_review", "approved", "rejected", "archived", "failed"];

export type ProductSortKey = "updatedAt" | "title" | "status" | "confidence" | "price" | "createdAt";

export interface ProductListItem {
  id: string;
  productKey: string;
  handle: string;
  status: ProductStatus;
  title: string | null;
  category: string | null;
  confidence: Record<string, number>;
  minConfidence: number | null;
  reviewReasons: string[];
  variantCount: number;
  priceFromCents: number | null;
  currency: string | null;
  photoCount: number;
  thumbBlobId: string | null;
  aiTier: string | null;
  aiModel: string | null;
  aiCostMicros: number;
  language: string;
  lastImportId: string | null;
  missingFromImportId: string | null;
  sourceChangedAt: string | null;
  published: boolean;
  deletedAt: string | null;
  translations: { fresh: number; outdated: number; failed: number; pending: number };
  updatedAt: string;
  createdAt: string;
}

/** Every status with its count (0 when none), for the strip above the table. */
export type ProductStatusCounts = Record<ProductStatus, number>;

export interface ProductListResponse {
  items: ProductListItem[];
  total: number;
  categories?: Array<{ category: string; n: number }>;
  statusCounts?: ProductStatusCounts;
}

export interface BulkApproveResponse {
  approved: string[];
  skipped: Array<{ id: string; reason: string }>;
}

export type RerunTier = "cheap" | "strong" | "vision" | "escalation";

export const RERUN_TIERS: ReadonlyArray<{ value: RerunTier; label: string }> = [
  { value: "cheap", label: "Cheap (fast model)" },
  { value: "strong", label: "Strong" },
  { value: "vision", label: "Vision (uses photos)" },
  { value: "escalation", label: "Escalation" },
];

/** What a re-run is asked to use; the prompt version is an id from `PROMPT_VERSIONS`. */
export interface RerunSettings {
  tier: RerunTier;
  promptVersion: string;
}

export interface BulkRerunResponse {
  queued: string[];
  skipped: Array<{ id: string; reason: string }>;
}

export interface ProductSeo {
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface ProductContent {
  title: string | null;
  descriptionHtml: string | null;
  category: string | null;
  tags: string[];
  attributes: Record<string, string>;
  seo: ProductSeo;
}

export interface ProductClaim {
  text: string;
  source: string;
  row?: number;
  column?: string;
  /** The words in that cell the claim rests on, as the supplier wrote them. Absent on products written before it was stored. */
  quote?: string;
  verified: boolean;
}

/** A claim or marketing term the grounding validator kept out of the listing, with the cell that contradicts it when there is one. */
export type ProductGuardrail = BlockedClaim;

export interface ProductRow {
  id: string;
  storeId: string;
  productKey: string;
  handle: string;
  status: ProductStatus;
  draft: ProductContent | null;
  published: { publishedAt: string; version: number } | null;
  manualOverrides: Partial<ProductContent>;
  confidence: Record<string, number>;
  claims: ProductClaim[];
  guardrails: ProductGuardrail[];
  reviewReasons: string[];
  group: ProductGroup | null;
  sourceRows: number[];
  duplicateRows: DuplicateRow[];
  language: string;
  aiTier: string | null;
  aiModel: string | null;
  promptVersion: string | null;
  failureReason: string | null;
  aiCostMicros: number;
  aiLatencyMs: number | null;
  version: number;
  lastImportId: string | null;
  missingFromImportId: string | null;
  sourceChangedAt: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VariantRow {
  id: string;
  sku: string;
  skuDisplay: string;
  synthetic: boolean;
  options: Record<string, string>;
  priceCents: number | null;
  currency: string | null;
  compareAtCents: number | null;
  weightGrams: number | null;
  dimensions: { lengthCm?: number; widthCm?: number; heightCm?: number; diameterCm?: number } | null;
  quantity: number | null;
  barcode: string | null;
  position: number;
  sourceRows: number[];
  issues: Issue[];
}

export interface PhotoRow {
  id: string;
  blobId: string;
  thumbBlobId: string;
  originalName: string;
  width: number;
  height: number;
  position: number;
  matchMethod: string;
  matchScore: number;
  variantId: string | null;
}

export type TranslationStatus = "fresh" | "outdated" | "pending" | "failed";

export interface TranslationRow {
  id: string;
  field: string;
  locale: string;
  sourceHash: string;
  text: string | null;
  origin: "ai" | "manual";
  status: TranslationStatus;
  error: string | null;
  updatedAt: string;
}

export interface SourceRow {
  rowNumber: number;
  raw: Record<string, string>;
  issues: Issue[];
  status: string;
  duplicateOfRow: number | null;
  /** What the deterministic cleaner changed in this row, raw → cleaned per field. */
  xray: CleaningXrayEntry[];
}

export interface ProductDetail {
  product: ProductRow;
  variants: VariantRow[];
  photos: PhotoRow[];
  translations: TranslationRow[];
  sourceRows: SourceRow[];
  importName: string | null;
}

/**
 * A source cell the merchant is pointing at (claim chip or guardrail hover/focus/click). `column` absent = whole
 * row; `quote` present = mark those words inside the cell. The tone says whether the words support the listing
 * (claim) or contradict it (guardrail).
 */
export interface SourceHighlight {
  row: number;
  column?: string;
  quote?: string;
  tone?: "claim" | "guardrail";
}

export function sameHighlight(a: SourceHighlight | null, b: SourceHighlight | null): boolean {
  if (a === null || b === null) return a === b;
  return a.row === b.row && a.column === b.column && a.quote === b.quote && a.tone === b.tone;
}

export type ProductAction =
  | { action: "approve"; force?: boolean }
  | { action: "reject"; reason?: string }
  | { action: "send_back"; reason: string }
  | { action: "rerun"; tier?: RerunTier; promptVersion?: string }
  | { action: "delete" }
  | { action: "restore" }
  | { action: "translate"; field: string; locale: string; text: string };

export const EMPTY_CONTENT: ProductContent = { title: null, descriptionHtml: null, category: null, tags: [], attributes: {}, seo: { metaTitle: null, metaDescription: null } };

export function imageUrl(storeSlug: string, blobId: string): string {
  return `/api/img/${encodeURIComponent(storeSlug)}/${blobId}`;
}
