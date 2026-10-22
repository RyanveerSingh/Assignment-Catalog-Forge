import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Dimensions, DuplicateRow, Issue, ProductGroup, RawRow } from "@/core/types";

/**
 * Database schema. Every business table carries `store_id` (multi-tenant from day one).
 * Postgres is the only source of truth: rows, products, the job queue and uploaded blobs all live here,
 * so a lost process, a lost cache or a wiped memory never loses work.
 */

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// ---------------------------------------------------------------------------
// Tenancy and auth
// ---------------------------------------------------------------------------

export interface StoreSettings {
  /** AES-GCM encrypted Anthropic key, base64. Absent = use the server key. */
  encryptedApiKey?: string;
  /** Brand names and terms that must never be translated. */
  glossary?: string[];
  /** Translate after the AI stage (default) or only when a product is approved. */
  translateOn?: "ai_done" | "approve";
  reviewThreshold?: number;
  importBudgetCents?: number;
}

export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  defaultCurrency: char("default_currency", { length: 3 }).notNull().default("EUR"),
  locales: jsonb("locales").$type<string[]>().notNull().default(sql`'["en","de","fr"]'::jsonb`),
  countryLocaleMap: jsonb("country_locale_map")
    .$type<Record<string, string>>()
    .notNull()
    .default(sql`'{"DE":"de","AT":"de","FR":"fr"}'::jsonb`),
  settings: jsonb("settings").$type<StoreSettings>().notNull().default(sql`'{}'::jsonb`),
  ...timestamps,
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the cookie token; the raw token never touches the database. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const storeMembers = pgTable(
  "store_members",
  {
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "editor"] }).notNull().default("editor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.storeId, t.userId] })],
);

// ---------------------------------------------------------------------------
// Blobs (the `pg` storage driver)
// ---------------------------------------------------------------------------

export const blobs = pgTable(
  "blobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id").notNull(),
    sha256: text("sha256").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("blobs_store_sha_idx").on(t.storeId, t.sha256)],
);

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

export const IMPORT_STATUSES = [
  "uploading",
  "queued",
  "parsing",
  "cleaning",
  "grouping",
  "enriching",
  "validating",
  "translating",
  "finalizing",
  "completed",
  "needs_attention",
  "paused",
  "failed",
  "cancelled",
] as const;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

/** Statuses during which a second upload of the same file is refused (EC-E6). */
export const ACTIVE_IMPORT_STATUSES: ReadonlyArray<ImportStatus> = [
  "uploading",
  "queued",
  "parsing",
  "cleaning",
  "grouping",
  "enriching",
  "validating",
  "translating",
  "finalizing",
  "paused",
];

export interface ImportCounts {
  pending: number;
  processing: number;
  done: number;
  needs_review: number;
  failed: number;
}

export interface ImportParseMeta {
  format?: string;
  encoding?: string;
  delimiter?: string;
  sheetName?: string;
  headerRowIndex?: number;
  headers?: string[];
  originalHeaders?: string[];
  issues?: Issue[];
}

export interface ImportCostSummary {
  totalMicros: number;
  byModel: Record<string, { calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; costMicros: number }>;
  byPurpose: Record<string, number>;
  /** What the same work would have cost on the strong model, realtime, with no caching. */
  naiveMicros: number;
  savedMicros: number;
}

export const imports = pgTable(
  "imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status", { enum: IMPORT_STATUSES }).notNull().default("uploading"),
    /** Status to return to after a pause. */
    resumeStatus: text("resume_status", { enum: IMPORT_STATUSES }),
    mode: text("mode", { enum: ["fast", "economy"] }).notNull().default("fast"),
    fileHash: text("file_hash"),
    totalRows: integer("total_rows").notNull().default(0),
    counts: jsonb("counts")
      .$type<ImportCounts>()
      .notNull()
      .default(sql`'{"pending":0,"processing":0,"done":0,"needs_review":0,"failed":0}'::jsonb`),
    productCount: integer("product_count").notNull().default(0),
    pausedUntil: timestamp("paused_until", { withTimezone: true }),
    pauseReason: text("pause_reason"),
    promptVersion: text("prompt_version").notNull().default("v1"),
    modelPolicy: jsonb("model_policy").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    budgetCents: integer("budget_cents").notNull().default(500),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    costSummary: jsonb("cost_summary").$type<ImportCostSummary>(),
    columnMap: jsonb("column_map").$type<unknown[]>(),
    parseMeta: jsonb("parse_meta").$type<ImportParseMeta>(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("imports_store_created_idx").on(t.storeId, t.createdAt),
    // EC-E6: the same file cannot be imported twice concurrently.
    uniqueIndex("imports_store_filehash_active_uq")
      .on(t.storeId, t.fileHash)
      .where(
        sql`status in ('uploading','queued','parsing','cleaning','grouping','enriching','validating','translating','finalizing','paused')`,
      ),
  ],
);

export const importFiles = pgTable(
  "import_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").notNull(),
    kind: text("kind", { enum: ["sheet", "photo", "zip"] }).notNull(),
    blobId: uuid("blob_id").notNull(),
    sha256: text("sha256").notNull(),
    size: integer("size").notNull(),
    mime: text("mime").notNull(),
    originalName: text("original_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("import_files_import_idx").on(t.importId)],
);

export const importEvents = pgTable(
  "import_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    level: text("level", { enum: ["info", "warn", "error"] }).notNull().default("info"),
    message: text("message").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("import_events_import_idx").on(t.importId, t.id)],
);

export const ROW_STATUSES = ["pending", "processing", "done", "needs_review", "failed"] as const;
export type RowStatus = (typeof ROW_STATUSES)[number];
export const ROW_STAGES = ["parsed", "cleaned", "grouped", "done"] as const;
export type RowStage = (typeof ROW_STAGES)[number];

export const importRows = pgTable(
  "import_rows",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").notNull(),
    rowNumber: integer("row_number").notNull(),
    raw: jsonb("raw").$type<RawRow["cells"]>().notNull(),
    cleaned: jsonb("cleaned").$type<unknown>(),
    rowHash: text("row_hash"),
    productKey: text("product_key"),
    productId: uuid("product_id"),
    stage: text("stage", { enum: ROW_STAGES }).notNull().default("parsed"),
    status: text("status", { enum: ROW_STATUSES }).notNull().default("pending"),
    failureReason: text("failure_reason"),
    issues: jsonb("issues").$type<Issue[]>().notNull().default(sql`'[]'::jsonb`),
    duplicateOfRow: integer("duplicate_of_row"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("import_rows_import_row_uq").on(t.importId, t.rowNumber),
    index("import_rows_import_status_idx").on(t.importId, t.status),
    index("import_rows_import_stage_idx").on(t.importId, t.stage),
    index("import_rows_product_idx").on(t.productId),
  ],
);

// ---------------------------------------------------------------------------
// Products, variants, photos
// ---------------------------------------------------------------------------

export const PRODUCT_STATUSES = ["pending_ai", "draft", "needs_review", "approved", "rejected", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export interface ProductClaim {
  text: string;
  source: string;
  row?: number;
  column?: string;
  verified: boolean;
}

export interface ProductSeo {
  metaTitle: string | null;
  metaDescription: string | null;
}

/** The AI-written, merchant-editable content of a product. Prices and SKUs live on variants. */
export interface ProductContent {
  title: string | null;
  descriptionHtml: string | null;
  category: string | null;
  tags: string[];
  attributes: Record<string, string>;
  seo: ProductSeo;
}

export interface PublishedVariant {
  sku: string;
  options: Record<string, string>;
  priceCents: number | null;
  currency: string | null;
  compareAtCents: number | null;
  weightGrams: number | null;
  dimensions: Dimensions | null;
  imageIds: string[];
}

export interface PublishedSnapshot extends ProductContent {
  handle: string;
  variants: PublishedVariant[];
  imageIds: string[];
  publishedAt: string;
  version: number;
}

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    productKey: text("product_key").notNull(),
    handle: text("handle").notNull(),
    status: text("status", { enum: PRODUCT_STATUSES }).notNull().default("pending_ai"),
    draft: jsonb("draft").$type<ProductContent>(),
    published: jsonb("published").$type<PublishedSnapshot>(),
    manualOverrides: jsonb("manual_overrides").$type<Partial<ProductContent>>().notNull().default(sql`'{}'::jsonb`),
    confidence: jsonb("confidence").$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
    claims: jsonb("claims").$type<ProductClaim[]>().notNull().default(sql`'[]'::jsonb`),
    reviewReasons: jsonb("review_reasons").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** The deterministic grouping result shown side by side with the AI output. */
    group: jsonb("group_data").$type<ProductGroup>(),
    sourceRows: jsonb("source_rows").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
    duplicateRows: jsonb("duplicate_rows").$type<DuplicateRow[]>().notNull().default(sql`'[]'::jsonb`),
    sourceHash: text("source_hash"),
    language: text("language").notNull().default("und"),
    aiTier: text("ai_tier"),
    aiModel: text("ai_model"),
    promptVersion: text("prompt_version"),
    aiCostMicros: bigint("ai_cost_micros", { mode: "number" }).notNull().default(0),
    aiLatencyMs: integer("ai_latency_ms"),
    /** Optimistic concurrency for merchant edits (EC-F7). */
    version: integer("version").notNull().default(1),
    lastImportId: uuid("last_import_id"),
    /** Set when a later import of the same source no longer contained this product (EC-C11). */
    missingFromImportId: uuid("missing_from_import_id"),
    /** Set when the source changed after approval; the diff is in the audit log (EC-F4). */
    sourceChangedAt: timestamp("source_changed_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("products_store_key_uq").on(t.storeId, t.productKey),
    uniqueIndex("products_store_handle_uq").on(t.storeId, t.handle),
    index("products_store_status_idx").on(t.storeId, t.status),
    index("products_store_updated_idx").on(t.storeId, t.updatedAt),
    index("products_last_import_idx").on(t.lastImportId),
  ],
);

export const variants = pgTable(
  "variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").notNull(),
    sku: text("sku").notNull(),
    skuDisplay: text("sku_display").notNull(),
    synthetic: boolean("synthetic").notNull().default(false),
    options: jsonb("options").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    priceCents: integer("price_cents"),
    currency: char("currency", { length: 3 }),
    compareAtCents: integer("compare_at_cents"),
    weightGrams: integer("weight_grams"),
    dimensions: jsonb("dimensions").$type<Dimensions>(),
    imageIds: jsonb("image_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    quantity: integer("quantity"),
    barcode: text("barcode"),
    position: integer("position").notNull().default(0),
    sourceRows: jsonb("source_rows").$type<number[]>().notNull().default(sql`'[]'::jsonb`),
    issues: jsonb("issues").$type<Issue[]>().notNull().default(sql`'[]'::jsonb`),
    ...timestamps,
  },
  (t) => [uniqueIndex("variants_store_sku_uq").on(t.storeId, t.sku), index("variants_product_idx").on(t.productId)],
);

export const photos = pgTable(
  "photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id").notNull(),
    importId: uuid("import_id"),
    /** 800 px WebP. */
    blobId: uuid("blob_id").notNull(),
    /** 400 px WebP. */
    thumbBlobId: uuid("thumb_blob_id").notNull(),
    sha256: text("sha256").notNull(),
    phash: text("phash"),
    originalName: text("original_name").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    productId: uuid("product_id"),
    variantId: uuid("variant_id"),
    position: integer("position").notNull().default(0),
    matchMethod: text("match_method").notNull().default("none"),
    matchScore: integer("match_score").notNull().default(0),
    status: text("status", { enum: ["matched", "unmatched", "rejected"] }).notNull().default("unmatched"),
    rejectReason: text("reject_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("photos_store_product_idx").on(t.storeId, t.productId),
    index("photos_import_idx").on(t.importId),
    index("photos_store_sha_idx").on(t.storeId, t.sha256),
  ],
);

// ---------------------------------------------------------------------------
// Translations
// ---------------------------------------------------------------------------

export const translations = pgTable(
  "translations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").notNull(),
    field: text("field").notNull(),
    locale: text("locale").notNull(),
    sourceHash: text("source_hash").notNull(),
    text: text("text"),
    origin: text("origin", { enum: ["ai", "manual"] }).notNull().default("ai"),
    status: text("status", { enum: ["fresh", "outdated", "pending", "failed"] }).notNull().default("pending"),
    model: text("model"),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    error: text("error"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("translations_product_field_locale_uq").on(t.productId, t.field, t.locale),
    index("translations_store_status_idx").on(t.storeId, t.status),
  ],
);

export const translationCache = pgTable(
  "translation_cache",
  {
    sourceHash: text("source_hash").notNull(),
    locale: text("locale").notNull(),
    text: text("text").notNull(),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sourceHash, t.locale] })],
);

// ---------------------------------------------------------------------------
// AI requests (cost tracking + response-first cache)
// ---------------------------------------------------------------------------

export const aiRequests = pgTable(
  "ai_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id").notNull(),
    importId: uuid("import_id"),
    productId: uuid("product_id"),
    purpose: text("purpose", { enum: ["enrich", "vision", "translate", "repair", "eval"] }).notNull(),
    model: text("model").notNull(),
    promptVersion: text("prompt_version").notNull(),
    requestHash: text("request_hash").notNull(),
    batchId: text("batch_id"),
    customId: text("custom_id"),
    status: text("status", { enum: ["pending", "succeeded", "failed"] }).notNull().default("pending"),
    attempt: integer("attempt").notNull().default(1),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costMicros: bigint("cost_micros", { mode: "number" }).notNull().default(0),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    response: jsonb("response").$type<unknown>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ai_requests_hash_idx").on(t.requestHash, t.status),
    index("ai_requests_import_idx").on(t.importId),
    index("ai_requests_store_created_idx").on(t.storeId, t.createdAt),
    index("ai_requests_batch_idx").on(t.batchId),
  ],
);

// ---------------------------------------------------------------------------
// Job queue
// ---------------------------------------------------------------------------

export const QUEUE_NAMES = ["default", "ai", "translate", "maintenance"] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];
export const JOB_STATUSES = ["queued", "running", "completed", "failed", "dead"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const jobs = pgTable(
  "jobs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    /** Deterministic key; enqueueing an existing queued/running key is a no-op (EC-E1). */
    key: text("key").notNull().unique(),
    queue: text("queue", { enum: QUEUE_NAMES }).notNull().default("default"),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: text("status", { enum: JOB_STATUSES }).notNull().default("queued"),
    /** Lower runs first. Small imports get a lower number so they are not starved (EC-E5). */
    priority: integer("priority").notNull().default(100),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    workerId: text("worker_id"),
    lastError: text("last_error"),
    storeId: uuid("store_id"),
    importId: uuid("import_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("jobs_claim_idx").on(t.queue, t.status, t.runAt, t.priority),
    index("jobs_import_idx").on(t.importId),
    index("jobs_locked_idx").on(t.status, t.lockedUntil),
  ],
);

export const queueState = pgTable("queue_state", {
  queue: text("queue", { enum: QUEUE_NAMES }).primaryKey(),
  pausedUntil: timestamp("paused_until", { withTimezone: true }),
  pauseReason: text("pause_reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Storefront snapshot (read path; never joins import tables)
// ---------------------------------------------------------------------------

export interface StorefrontImage {
  id: string;
  thumbId: string;
  alt: string;
}

export const storefrontProducts = pgTable(
  "storefront_products",
  {
    productId: uuid("product_id").notNull(),
    storeId: uuid("store_id").notNull(),
    locale: text("locale").notNull(),
    handle: text("handle").notNull(),
    title: text("title").notNull(),
    descriptionHtml: text("description_html"),
    category: text("category"),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    attributes: jsonb("attributes").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    variants: jsonb("variants").$type<PublishedVariant[]>().notNull().default(sql`'[]'::jsonb`),
    images: jsonb("images").$type<StorefrontImage[]>().notNull().default(sql`'[]'::jsonb`),
    priceFromCents: integer("price_from_cents"),
    currency: char("currency", { length: 3 }),
    seo: jsonb("seo").$type<ProductSeo>(),
    /** Fields that are English fallbacks because no fresh translation exists (EC-H2). */
    fallbackFields: jsonb("fallback_fields").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.locale] }),
    uniqueIndex("storefront_store_locale_handle_uq").on(t.storeId, t.locale, t.handle),
    index("storefront_store_locale_category_idx").on(t.storeId, t.locale, t.category),
  ],
);

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    events: jsonb("events").$type<string[]>().notNull().default(sql`'["import.completed"]'::jsonb`),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhooks_store_idx").on(t.storeId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    storeId: uuid("store_id").notNull(),
    eventId: text("event_id").notNull(),
    event: text("event").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    attempt: integer("attempt").notNull().default(0),
    status: text("status", { enum: ["pending", "delivered", "failed"] }).notNull().default("pending"),
    responseCode: integer("response_code"),
    error: text("error"),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("webhook_deliveries_event_uq").on(t.webhookId, t.eventId)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_keys_store_idx").on(t.storeId)],
);

export const evalRuns = pgTable("eval_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id"),
  name: text("name").notNull(),
  promptVersion: text("prompt_version").notNull(),
  model: text("model").notNull(),
  sample: text("sample").notNull(),
  metrics: jsonb("metrics").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    storeId: uuid("store_id").notNull(),
    actorId: uuid("actor_id"),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    diff: jsonb("diff").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.storeId, t.entity, t.entityId)],
);
