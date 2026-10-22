import { getDb } from "@/db/client";
import { listProducts } from "@/db/repositories/products-query";
import { PRODUCT_STATUSES, type ProductStatus } from "@/db/schema";
import { json, parseIntParam, withApi } from "@/lib/http";
import { requireApiKeyStore } from "@/lib/session";

/** GET /api/v1/products?status=approved&limit=&offset=&q= — the same listing the dashboard uses. */
export const GET = withApi(async (req: Request) => {
  const { storeId } = await requireApiKeyStore(req);
  const url = new URL(req.url);
  const statuses = url.searchParams.getAll("status").filter((s): s is ProductStatus => (PRODUCT_STATUSES as readonly string[]).includes(s));
  const result = await listProducts(getDb(), storeId, {
    filters: { status: statuses.length ? statuses : undefined, search: url.searchParams.get("q")?.slice(0, 100) || undefined },
    limit: parseIntParam(url.searchParams.get("limit"), 50, 1, 200),
    offset: parseIntParam(url.searchParams.get("offset"), 0),
    sort: "updatedAt",
    direction: "desc",
  });
  return json(result);
});
