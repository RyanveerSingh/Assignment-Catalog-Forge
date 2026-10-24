import { z } from "zod";
import { isPromptVersion, PROMPT_VERSIONS } from "@/core/ai/prompts";
import { getDb } from "@/db/client";
import { countProductsByStatus } from "@/db/repositories/overview";
import { listCategories, listProducts, type ProductSortKey } from "@/db/repositories/products-query";
import { bulkApprove, bulkRerunAi } from "@/db/repositories/review";
import { PRODUCT_STATUSES, type ProductStatus } from "@/db/schema";
import { consumeDemoReruns, isLockedDemoUser } from "@/lib/demo-lockdown";
import { HttpError, json, parseIntParam, withApi } from "@/lib/http";
import { isUuid, optionalUuidQuery } from "@/lib/ids";
import { requireStore } from "@/lib/session";

type Ctx = { params: Promise<{ slug: string }> };

const SORT_KEYS: ProductSortKey[] = ["updatedAt", "title", "status", "confidence", "price", "createdAt"];

export const GET = withApi(async (req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store } = await requireStore(slug);
  const url = new URL(req.url);
  const q = url.searchParams;
  const statuses = q.getAll("status").filter((s): s is ProductStatus => (PRODUCT_STATUSES as readonly string[]).includes(s));
  const sortParam = q.get("sort");
  const sort = SORT_KEYS.includes(sortParam as ProductSortKey) ? (sortParam as ProductSortKey) : "updatedAt";
  const result = await listProducts(getDb(), store.id, {
    filters: {
      status: statuses.length ? statuses : undefined,
      search: q.get("q")?.slice(0, 100) || undefined,
      importId: optionalUuidQuery(q.get("importId"), "importId"),
      category: q.get("category") || undefined,
      minConfidence: q.get("minConfidence") ? parseIntParam(q.get("minConfidence"), 0, 0, 100) : undefined,
      maxConfidence: q.get("maxConfidence") ? parseIntParam(q.get("maxConfidence"), 100, 0, 100) : undefined,
      hasPhotos: q.get("hasPhotos") === "true" ? true : q.get("hasPhotos") === "false" ? false : undefined,
      outdatedTranslations: q.get("outdated") === "true",
      missingFromImport: q.get("missing") === "true",
      includeDeleted: q.get("deleted") === "true",
    },
    sort,
    direction: q.get("dir") === "asc" ? "asc" : "desc",
    limit: parseIntParam(q.get("limit"), 25, 1, 100),
    offset: parseIntParam(q.get("offset"), 0),
  });
  // Whole-store counts, unfiltered on purpose: the strip shows the catalog, the table shows the slice.
  const [categories, statusCounts] = await Promise.all([
    q.get("withCategories") === "true" ? listCategories(getDb(), store.id) : undefined,
    q.get("withStatusCounts") === "true" ? countProductsByStatus(getDb(), store.id) : undefined,
  ]);
  return json({ ...result, categories, statusCounts });
});

const idsSchema = z.array(z.string().refine(isUuid, "Product ids are UUIDs")).min(1, "Select at least one product").max(500);

const bulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), ids: idsSchema, includeNeedsReview: z.boolean().optional() }),
  z.object({
    action: z.literal("rerun"),
    ids: idsSchema,
    tier: z.enum(["cheap", "strong", "vision", "escalation"]).optional(),
    promptVersion: z
      .string()
      .max(20)
      .refine(isPromptVersion, { message: `Prompt version must be one of ${PROMPT_VERSIONS.map((v) => v.id).join(", ")}` })
      .optional(),
  }),
]);

/**
 * Bulk actions over a selection (at most 500 ids): approve (EC-F5) or re-run the AI stage with another
 * tier and prompt version (EC-F10). Both answer with what was done and what was skipped, with a reason.
 */
export const POST = withApi(async (req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store, user } = await requireStore(slug);
  const parsed = bulkSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "invalid_body", "Invalid bulk action", parsed.error.issues);
  const body = parsed.data;
  if (body.action === "approve") return json(await bulkApprove(getDb(), store.id, body.ids, user.id, { includeNeedsReview: Boolean(body.includeNeedsReview) }));
  if (isLockedDemoUser(user)) consumeDemoReruns(store.id, new Set(body.ids).size);
  return json(await bulkRerunAi(getDb(), store.id, body.ids, user.id, { tier: body.tier, promptVersion: body.promptVersion }));
});
