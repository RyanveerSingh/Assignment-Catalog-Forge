import { z } from "zod";
import { isPromptVersion } from "@/core/ai/prompts";
import { asColumnMappings, buildCleaningXray, isCleanedRow } from "@/core/clean/xray";
import { getDb } from "@/db/client";
import { getProductDetail } from "@/db/repositories/products-query";
import { approveProduct, rejectProduct, rerunProductAi, restoreProduct, sendBackProduct, setManualTranslation, softDeleteProduct, updateProductDraft } from "@/db/repositories/review";
import { consumeDemoReruns, isLockedDemoUser } from "@/lib/demo-lockdown";
import { HttpError, json, withApi } from "@/lib/http";
import { requireUuidParam } from "@/lib/ids";
import { requireStore } from "@/lib/session";

type Ctx = { params: Promise<{ slug: string; id: string }> };

const productId = (id: string): string => requireUuidParam(id, "product_not_found", "Product not found");

/**
 * Product detail for the review drawer. Each source row carries its cleaning X-ray (raw → cleaned per
 * field) instead of the stored CleanedRow blob, which is far larger than what the drawer needs.
 */
export const GET = withApi(async (_req: Request, { params }: Ctx) => {
  const { slug, id: rawId } = await params;
  const { store } = await requireStore(slug);
  const id = productId(rawId);
  const detail = await getProductDetail(getDb(), store.id, id);
  if (!detail) throw new HttpError(404, "product_not_found", "Product not found");
  const { columnMap, sourceRows, ...rest } = detail;
  const mappings = asColumnMappings(columnMap);
  return json({
    ...rest,
    sourceRows: sourceRows.map(({ cleaned, ...row }) => ({ ...row, xray: isCleanedRow(cleaned) ? buildCleaningXray(row.raw, cleaned, row.issues, mappings) : [] })),
  });
});

const patchSchema = z.object({
  version: z.number().int(),
  title: z.string().max(200).nullable().optional(),
  descriptionHtml: z.string().max(50_000).nullable().optional(),
  category: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  attributes: z.record(z.string(), z.string().max(500)).optional(),
  seo: z.object({ metaTitle: z.string().max(80).nullable().optional(), metaDescription: z.string().max(200).nullable().optional() }).optional(),
});

/** Edit the draft. Fields you send become manual overrides (EC-F1); `version` guards concurrent edits (EC-F7). */
export const PATCH = withApi(async (req: Request, { params }: Ctx) => {
  const { slug, id: rawId } = await params;
  const { store, user } = await requireStore(slug);
  const id = productId(rawId);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "invalid_body", "Invalid product patch", parsed.error.issues);
  const { version, ...rest } = parsed.data;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
  if (rest.descriptionHtml) {
    const { sanitizeDescriptionHtml } = await import("@/core/clean/html");
    patch.descriptionHtml = sanitizeDescriptionHtml(rest.descriptionHtml).html;
  }
  const result = await updateProductDraft(getDb(), store.id, id, patch, version, user.id);
  if (!result.ok) throw new HttpError(result.code === "version_conflict" ? 409 : 404, result.code ?? "error", result.message ?? "Update failed");
  return json({ ok: true, version: result.version });
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), force: z.boolean().optional() }),
  z.object({ action: z.literal("reject"), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal("send_back"), reason: z.string().min(1).max(500) }),
  z.object({ action: z.literal("rerun"), tier: z.enum(["cheap", "strong", "vision", "escalation"]).optional(), promptVersion: z.string().max(20).refine(isPromptVersion, "Prompt version must be one of the registered versions").optional() }),
  z.object({ action: z.literal("delete") }),
  z.object({ action: z.literal("restore") }),
  z.object({ action: z.literal("translate"), field: z.string().min(1).max(100), locale: z.string().min(2).max(5), text: z.string().max(50_000) }),
]);

export const POST = withApi(async (req: Request, { params }: Ctx) => {
  const { slug, id: rawId } = await params;
  const { store, user } = await requireStore(slug);
  const id = productId(rawId);
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "invalid_body", "Invalid action", parsed.error.issues);
  const db = getDb();
  const a = parsed.data;
  if (a.action === "rerun" && isLockedDemoUser(user)) consumeDemoReruns(store.id, 1);
  const result = await (async () => {
    switch (a.action) {
      case "approve":
        return approveProduct(db, store.id, id, user.id, { force: a.force });
      case "reject":
        return rejectProduct(db, store.id, id, user.id, a.reason ?? null);
      case "send_back":
        return sendBackProduct(db, store.id, id, user.id, a.reason);
      case "rerun":
        return rerunProductAi(db, store.id, id, user.id, { tier: a.tier, promptVersion: a.promptVersion });
      case "delete":
        return softDeleteProduct(db, store.id, id, user.id);
      case "restore":
        return restoreProduct(db, store.id, id, user.id);
      case "translate":
        return setManualTranslation(db, store.id, id, a.field, a.locale, a.text, user.id);
    }
  })();
  if (!result.ok) throw new HttpError(result.code === "not_found" ? 404 : 409, result.code ?? "error", result.message ?? "Action failed");
  return json({ ok: true });
});
