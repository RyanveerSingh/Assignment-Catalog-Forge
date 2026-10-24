import { z } from "zod";

/**
 * Validated process configuration. Imported once per process; a bad value fails fast at boot
 * with a readable message instead of surfacing as a confusing runtime error later.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_POOL_URL: z.string().optional(),

  AI_PROVIDER: z.enum(["anthropic", "mock"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_CHEAP: z.string().default("claude-haiku-5-5"),
  AI_MODEL_STRONG: z.string().default("claude-sonnet-5-5"),
  AI_MODEL_ESCALATION: z.string().default("claude-opus-5-5"),
  AI_IMPORT_BUDGET_CENTS: z.coerce.number().int().nonnegative().default(500),
  AI_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),

  WORKER_MODE: z.enum(["embedded", "separate", "none"]).default("embedded"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),

  STORAGE_DRIVER: z.enum(["pg", "local", "s3"]).default("pg"),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_REGION: z.string().default("auto"),

  APP_SECRET: z.string().min(16, "APP_SECRET must be at least 16 characters"),
  // Not BASE_URL: Vite/Vitest define that name themselves ("/") and dotenv never overrides an existing variable.
  APP_BASE_URL: z.url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "silent"]).default("info"),

  MAX_ROWS_PER_IMPORT: z.coerce.number().int().positive().default(10_000),
  MAX_PHOTOS_PER_IMPORT: z.coerce.number().int().positive().default(2_000),
  MAX_SHEET_BYTES: z.coerce.number().int().positive().default(50 * 1024 * 1024),
  MAX_PHOTO_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
  // The ZIP and the whole request must fit in a 512 MB instance: the multipart body is buffered once
  // by the form parser and copied once more into Buffers, so 120 MB in flight peaks near 250 MB.
  MAX_ZIP_BYTES: z.coerce.number().int().positive().default(100 * 1024 * 1024),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(120 * 1024 * 1024),

  /** "true" seeds the shared demo account at boot. */
  SEED_DEMO: z.string().optional(),
  /** Locks the shared demo account out of costly or global settings; defaults to on when SEED_DEMO=true. */
  DEMO_LOCKDOWN: z.enum(["true", "false"]).optional(),
  DEMO_BUDGET_CAP_CENTS: z.coerce.number().int().nonnegative().default(200),

  CHAOS_RATE_LIMIT_PCT: z.coerce.number().min(0).max(100).default(0),
  CHAOS_TIMEOUT_PCT: z.coerce.number().min(0).max(100).default(0),
  CHAOS_INVALID_JSON_PCT: z.coerce.number().min(0).max(100).default(0),
  CHAOS_INVENTED_CLAIM_PCT: z.coerce.number().min(0).max(100).default(0),
});

export type Config = z.infer<typeof schema>;

let cached: Config | null = null;

/** Parse `process.env` once. Throws a readable error listing every invalid variable. */
export function getConfig(): Config {
  if (cached) return cached;
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join("\n")}`);
  }
  if (result.data.AI_PROVIDER === "anthropic" && !result.data.ANTHROPIC_API_KEY) {
    throw new Error("AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY (or set AI_PROVIDER=mock)");
  }
  if (result.data.STORAGE_DRIVER === "s3") {
    for (const key of ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
      if (!result.data[key]) throw new Error(`STORAGE_DRIVER=s3 requires ${key}`);
    }
  }
  cached = result.data;
  return cached;
}

/** Test helper: forget the cached config so a test can set env vars and re-parse. */
export function resetConfigForTests(): void {
  cached = null;
}
