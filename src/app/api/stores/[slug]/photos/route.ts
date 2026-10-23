import { getDb } from "@/db/client";
import { listPhotosByStatus } from "@/db/repositories/photos";
import { json, parseIntParam, withApi } from "@/lib/http";
import { requireStore } from "@/lib/session";

type Ctx = { params: Promise<{ slug: string }> };

/** Photos outside any product: `status=unmatched` (default) or `status=rejected` (dismissed by the merchant). Paginated. */
export const GET = withApi(async (req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store } = await requireStore(slug);
  const q = new URL(req.url).searchParams;
  const status = q.get("status") === "rejected" ? "rejected" : "unmatched";
  const result = await listPhotosByStatus(getDb(), store.id, status, { limit: parseIntParam(q.get("limit"), 24, 1, 100), offset: parseIntParam(q.get("offset"), 0) });
  return json({ total: result.total, items: result.items.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })) });
});
