import type { Dimensions } from "../types";

/** Product lifecycle status as stored in the DB; "approved" is the only published state. */
export type ExportStatus =
  | "draft"
  | "needs_review"
  | "approved"
  | "rejected"
  | "archived"
  | "failed"
  | "pending_ai";

export interface ExportVariant {
  sku: string;
  /** Option name → value, e.g. { size: "20 cm", color: "terracotta" }. */
  options: Record<string, string>;
  priceCents: number | null;
  currency: string | null;
  compareAtCents: number | null;
  weightGrams: number | null;
  dimensionsCm: Dimensions | null;
  barcode: string | null;
  quantity: number | null;
  imageUrls: string[];
}

export interface ExportClaim {
  text: string;
  /** The source cell or sentence that grounds the claim. */
  source: string;
}

export interface ExportSeo {
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface ExportTranslation {
  title?: string | null;
  descriptionHtml?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
}

/**
 * The storage-agnostic view of a product that every exporter consumes. Built by the
 * export job from DB rows; the exporters themselves never touch the database.
 */
export interface ExportProduct {
  handle: string;
  title: string | null;
  descriptionHtml: string | null;
  category: string | null;
  tags: string[];
  attributes: Record<string, string>;
  seo: ExportSeo;
  vendor: string | null;
  status: ExportStatus;
  reviewReasons: string[];
  /** Field → 0–100. */
  confidence: Record<string, number>;
  claims: ExportClaim[];
  sourceRows: number[];
  variants: ExportVariant[];
  imageUrls: string[];
  /** Language code → translated fields. Omitted when the product has no translations. */
  translations?: Record<string, ExportTranslation>;
}
