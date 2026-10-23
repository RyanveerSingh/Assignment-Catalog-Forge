import { and, eq } from "drizzle-orm";
import { buildTranslateSystemPrompt, renderTranslateUserText, type TranslateInput } from "@/core/ai/prompts";
import { aiTranslateBatchSchema } from "@/core/ai/schema";
import { protectText, verifyAndRestore, type ProtectedText } from "@/core/translate/protect";
import type { Db } from "@/db/client";
import { appendImportEvent, pauseImport } from "@/db/repositories/imports";
import { aiRequests, products, stores, translationCache, translations } from "@/db/schema";
import { refreshChaos } from "@/lib/app-settings";
import { decryptSecret, sha256Hex, stableHash } from "@/lib/crypto";
import { getAiProvider, isAiError, modelForTier } from "@/providers/ai";
import { JobError } from "@/queue/errors";
import type { JobHandler } from "@/worker/loop";
import { driveImport } from "./drive";
import { contentFields, republishIfLive } from "./publish";

const MAX_ITEMS_PER_CALL = 40;

/**
 * Translate a product's English content into every store locale, ahead of time, with three
 * layers of reuse: unchanged source hash → skip; manual fix → keep (mark outdated if English
 * changed); global cache by (hash, locale) → copy. Only the remaining strings go to the model,
 * with placeholders protected and verified (EC-G1–G8, F3).
 */
export const translateHandler: JobHandler = async ({ job, db, log }) => {
  const productId = job.payload.productId as string | undefined;
  if (!productId) throw new JobError("translate job without productId", { retryable: false });
  const [p] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!p || !p.draft || p.deletedAt) {
    if (p) await db.update(products).set({ translatedAt: new Date() }).where(eq(products.id, productId));
    if (job.importId) await driveImport(db, job.importId);
    return;
  }
  const [store] = await db.select({ locales: stores.locales, settings: stores.settings }).from(stores).where(eq(stores.id, p.storeId)).limit(1);
  if (!store) return;
  if (store.settings.translateOn === "approve" && p.status !== "approved") {
    await db.update(products).set({ translatedAt: new Date() }).where(eq(products.id, productId));
    if (job.importId) await driveImport(db, job.importId);
    return;
  }

  const locales = store.locales.filter((l) => l !== "en");
  const fields = contentFields(p.draft);
  const existing = await db.select().from(translations).where(eq(translations.productId, productId));
  const glossary = store.settings.glossary ?? [];
  const storeKey = store.settings.encryptedApiKey ? safeDecrypt(store.settings.encryptedApiKey) : null;
  await refreshChaos(db);
  const { provider, mode } = getAiProvider(storeKey);
  const model = modelForTier("cheap", mode);
  let totalCost = 0;
  let translatedCount = 0;
  let cachedCount = 0;
  let failedCount = 0;

  for (const locale of locales) {
    const work: Array<{ field: string; text: string; kind: "title" | "html" | "meta" | "plain"; sourceHash: string; protectedText: ProtectedText }> = [];
    for (const f of fields) {
      const sourceHash = sha256Hex(f.text);
      const current = existing.find((t) => t.locale === locale && t.field === f.field);
      if (current?.origin === "manual") {
        // A merchant's fix always wins; if the English moved on, flag it instead of overwriting (EC-F3).
        if (current.sourceHash !== sourceHash && current.status !== "outdated") {
          await db.update(translations).set({ status: "outdated", updatedAt: new Date() }).where(eq(translations.id, current.id));
        }
        continue;
      }
      if (current && current.status === "fresh" && current.sourceHash === sourceHash) continue;
      // Keyed by model as well: a demo-provider or older-model translation must never be served to this store.
      const [cached] = await db
        .select({ text: translationCache.text, model: translationCache.model })
        .from(translationCache)
        .where(and(eq(translationCache.sourceHash, sourceHash), eq(translationCache.locale, locale), eq(translationCache.model, model)))
        .limit(1);
      if (cached) {
        await upsertTranslation(db, { productId, storeId: p.storeId, field: f.field, locale, sourceHash, text: cached.text, status: "fresh", model: cached.model, costMicros: 0, error: null });
        cachedCount += 1;
        continue;
      }
      work.push({ ...f, sourceHash, protectedText: protectText(f.text, glossary) });
    }

    for (let i = 0; i < work.length; i += MAX_ITEMS_PER_CALL) {
      const slice = work.slice(i, i + MAX_ITEMS_PER_CALL);
      const input: TranslateInput = { locale, glossary, items: slice.map((w) => ({ id: w.field, text: w.protectedText.text, kind: w.kind })) };
      const requestHash = stableHash({ model, locale, input });
      const started = Date.now();
      try {
        const res = await provider.complete({
          purpose: "translate",
          model,
          system: buildTranslateSystemPrompt(p.promptVersion ?? "v1"),
          userText: renderTranslateUserText(input),
          input,
          schema: aiTranslateBatchSchema,
          maxTokens: 8_000,
          effort: "low",
          customId: `${job.key}:${locale}:${i}`,
        });
        totalCost += res.costMicros;
        await db.insert(aiRequests).values({
          storeId: p.storeId,
          importId: job.importId ?? null,
          productId,
          purpose: "translate",
          model,
          promptVersion: p.promptVersion ?? "v1",
          requestHash,
          status: "succeeded",
          attempt: job.attempts,
          inputTokens: res.usage.inputTokens,
          outputTokens: res.usage.outputTokens,
          cacheReadTokens: res.usage.cacheReadTokens,
          cacheWriteTokens: res.usage.cacheWriteTokens,
          costMicros: res.costMicros,
          latencyMs: res.latencyMs,
        });
        const byId = new Map(res.output.items.map((it) => [it.id, it.text] as const));
        for (const w of slice) {
          const translated = byId.get(w.field);
          const verified = translated !== undefined ? verifyAndRestore(translated, w.protectedText) : { ok: false, restored: null, problems: ["missing from the model output"] };
          if (verified.ok && verified.restored) {
            await upsertTranslation(db, { productId, storeId: p.storeId, field: w.field, locale, sourceHash: w.sourceHash, text: verified.restored, status: "fresh", model, costMicros: Math.round(res.costMicros / slice.length), error: null });
            await db
              .insert(translationCache)
              .values({ sourceHash: w.sourceHash, locale, text: verified.restored, model })
              .onConflictDoNothing();
            translatedCount += 1;
          } else {
            await upsertTranslation(db, { productId, storeId: p.storeId, field: w.field, locale, sourceHash: w.sourceHash, text: null, status: "failed", model, costMicros: 0, error: verified.problems.join("; ") });
            failedCount += 1;
          }
        }
      } catch (err) {
        await db.insert(aiRequests).values({ storeId: p.storeId, importId: job.importId ?? null, productId, purpose: "translate", model, promptVersion: p.promptVersion ?? "v1", requestHash, status: "failed", attempt: job.attempts, latencyMs: Date.now() - started, error: err instanceof Error ? err.message.slice(0, 2000) : String(err) });
        throw await translateFailure(db, job.importId, err);
      }
    }
  }

  await db.update(products).set({ translatedAt: new Date(), aiCostMicros: p.aiCostMicros + totalCost, updatedAt: new Date() }).where(eq(products.id, productId));
  await republishIfLive(db, productId);
  log.info({ locales: locales.length, translated: translatedCount, cached: cachedCount, failed: failedCount, costMicros: totalCost }, "translated");
  if (job.importId) {
    if (failedCount > 0) await appendImportEvent(db, job.importId, "warn", `${failedCount} translation(s) failed verification for "${p.draft.title}"; English will be shown for those fields`, { productId });
    await driveImport(db, job.importId);
  }
};

async function upsertTranslation(db: Db, row: { productId: string; storeId: string; field: string; locale: string; sourceHash: string; text: string | null; status: "fresh" | "failed"; model: string; costMicros: number; error: string | null }): Promise<void> {
  await db
    .insert(translations)
    .values({ ...row, origin: "ai", updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [translations.productId, translations.field, translations.locale],
      set: { sourceHash: row.sourceHash, text: row.text, status: row.status, model: row.model, costMicros: row.costMicros, error: row.error, origin: "ai", updatedAt: new Date() },
      setWhere: eq(translations.origin, "ai"),
    });
}

async function translateFailure(db: Db, importId: string | null, err: unknown): Promise<JobError> {
  if (!isAiError(err)) return new JobError(err instanceof Error ? err.message : String(err), { cause: err });
  switch (err.kind) {
    case "rate_limit":
    case "overloaded": {
      const ms = err.retryAfterMs ?? 60_000;
      if (importId) await pauseImport(db, importId, new Date(Date.now() + ms), `Rate limited by the AI provider; resuming in ${Math.ceil(ms / 60_000)} min`);
      return new JobError(err.message, { pauseQueue: { queue: "translate", untilMs: ms, reason: "Rate limited by the AI provider" }, cause: err });
    }
    case "auth":
    case "billing":
      if (importId) await pauseImport(db, importId, null, "The AI API key was rejected or has no credit. Fix it in Settings and resume.");
      return new JobError(err.message, { retryable: true, retryAfterMs: 10 * 60_000, cause: err });
    case "bad_request":
    case "refusal":
      return new JobError(err.message, { retryable: false, cause: err });
    default:
      return new JobError(err.message, { retryable: true, cause: err });
  }
}

function safeDecrypt(value: string): string | null {
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}
