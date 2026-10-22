import { getDb } from "@/db/client";
import { listCategories, listProducts, type ProductSortKey } from "@/db/repositories/products-query";
import { bulkApprove } from "@/db/repositories/review";
import { PRODUCT_STATUSES, type ProductStatus } from "@/db/schema";
import { HttpError, json, parseIntParam, withApi } from "@/lib/http";
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
      importId: q.get("importId") || undefined,
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
  const categories = q.get("withCategories") === "true" ? await listCategories(getDb(), store.id) : undefined;
  return json({ ...result, categories });
});

/** Bulk actions. Body: { action: "approve", ids: string[], includeNeedsReview?: boolean } */
export const POST = withApi(async (req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store, user } = await requireStore(slug);
  const body = (await req.json().catch(() => ({}))) as { action?: string; ids?: unknown; includeNeedsReview?: boolean };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string").slice(0, 500) : [];
  if (ids.length === 0) throw new HttpError(400, "no_ids", "Select at least one product");
  if (body.action !== "approve") throw new HttpError(400, "unknown_action", "Supported bulk action: approve");
  const result = await bulkApprove(getDb(), store.id, ids, user.id, { includeNeedsReview: Boolean(body.includeNeedsReview) });
  return json(result);
});
