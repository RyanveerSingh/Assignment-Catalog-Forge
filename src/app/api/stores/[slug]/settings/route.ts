import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { stores, type StoreSettings } from "@/db/schema";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto";
import { getConfig } from "@/lib/config";
import { HttpError, json, withApi } from "@/lib/http";
import { requireStore } from "@/lib/session";

type Ctx = { params: Promise<{ slug: string }> };

function serialize(row: typeof stores.$inferSelect) {
  const cfg = getConfig();
  let keyMasked: string | null = null;
  if (row.settings.encryptedApiKey) {
    try {
      keyMasked = maskSecret(decryptSecret(row.settings.encryptedApiKey));
    } catch {
      keyMasked = "(unreadable; set it again)";
    }
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    defaultCurrency: row.defaultCurrency,
    locales: row.locales,
    countryLocaleMap: row.countryLocaleMap,
    glossary: row.settings.glossary ?? [],
    translateOn: row.settings.translateOn ?? "ai_done",
    importBudgetCents: row.settings.importBudgetCents ?? cfg.AI_IMPORT_BUDGET_CENTS,
    apiKeyMasked: keyMasked,
    serverKeyConfigured: cfg.AI_PROVIDER === "anthropic" && Boolean(cfg.ANTHROPIC_API_KEY),
    aiMode: keyMasked || (cfg.AI_PROVIDER === "anthropic" && cfg.ANTHROPIC_API_KEY) ? "anthropic" : "mock",
  };
}

export const GET = withApi(async (_req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store } = await requireStore(slug);
  const [row] = await getDb().select().from(stores).where(eq(stores.id, store.id)).limit(1);
  if (!row) throw new HttpError(404, "store_not_found", "Store not found");
  return json(serialize(row));
});

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  defaultCurrency: z.string().length(3).optional(),
  locales: z.array(z.string().min(2).max(5)).min(1).max(8).optional(),
  countryLocaleMap: z.record(z.string().length(2), z.string().min(2).max(5)).optional(),
  glossary: z.array(z.string().min(1).max(60)).max(200).optional(),
  translateOn: z.enum(["ai_done", "approve"]).optional(),
  importBudgetCents: z.number().int().min(0).max(100_000).optional(),
  /** Empty string clears the store key and falls back to the server key / demo mode. */
  apiKey: z.string().max(300).optional(),
});

export const PATCH = withApi(async (req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store } = await requireStore(slug);
  if (store.role !== "owner") throw new HttpError(403, "forbidden", "Only the store owner can change settings");
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "invalid_body", "Invalid settings", parsed.error.issues);
  const db = getDb();
  const [row] = await db.select().from(stores).where(eq(stores.id, store.id)).limit(1);
  if (!row) throw new HttpError(404, "store_not_found", "Store not found");
  const d = parsed.data;
  const settings: StoreSettings = { ...row.settings };
  if (d.glossary !== undefined) settings.glossary = d.glossary;
  if (d.translateOn !== undefined) settings.translateOn = d.translateOn;
  if (d.importBudgetCents !== undefined) settings.importBudgetCents = d.importBudgetCents;
  if (d.apiKey !== undefined) {
    const trimmed = d.apiKey.trim();
    if (trimmed === "") delete settings.encryptedApiKey;
    else if (!trimmed.startsWith("sk-ant-")) throw new HttpError(400, "invalid_api_key", "Anthropic keys start with sk-ant-");
    else settings.encryptedApiKey = encryptSecret(trimmed);
  }
  const locales = d.locales ? [...new Set(["en", ...d.locales])] : row.locales;
  await db
    .update(stores)
    .set({
      name: d.name ?? row.name,
      defaultCurrency: d.defaultCurrency?.toUpperCase() ?? row.defaultCurrency,
      locales,
      countryLocaleMap: d.countryLocaleMap ?? row.countryLocaleMap,
      settings,
      updatedAt: new Date(),
    })
    .where(eq(stores.id, store.id));
  const [updated] = await db.select().from(stores).where(eq(stores.id, store.id)).limit(1);
  return json(serialize(updated!));
});
