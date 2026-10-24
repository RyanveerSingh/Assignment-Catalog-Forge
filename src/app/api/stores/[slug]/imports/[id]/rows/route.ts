import { getDb } from "@/db/client";
import { getImport } from "@/db/repositories/imports";
import { listRows } from "@/db/repositories/rows";
import { ROW_STATUSES, type RowStatus } from "@/db/schema";
import { HttpError, json, parseIntParam, withApi } from "@/lib/http";
import { requireUuidParam } from "@/lib/ids";
import { requireStore } from "@/lib/session";

type Ctx = { params: Promise<{ slug: string; id: string }> };

export const GET = withApi(async (req: Request, { params }: Ctx) => {
  const { slug, id: rawId } = await params;
  const id = requireUuidParam(rawId, "import_not_found", "Import not found");
  const { store } = await requireStore(slug);
  const db = getDb();
  const imp = await getImport(db, store.id, id);
  if (!imp) throw new HttpError(404, "import_not_found", "Import not found");
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const status = statusParam && (ROW_STATUSES as readonly string[]).includes(statusParam) ? (statusParam as RowStatus) : undefined;
  const limit = parseIntParam(url.searchParams.get("limit"), 50, 1, 200);
  const offset = parseIntParam(url.searchParams.get("offset"), 0);
  const search = url.searchParams.get("q")?.slice(0, 100) || undefined;
  const { rows, total } = await listRows(db, id, { status, limit, offset, search });
  return json({
    total,
    rows: rows.map((r) => ({
      id: r.id,
      rowNumber: r.rowNumber,
      status: r.status,
      stage: r.stage,
      productId: r.productId,
      productKey: r.productKey,
      duplicateOfRow: r.duplicateOfRow,
      failureReason: r.failureReason,
      issues: r.issues,
      raw: r.raw,
    })),
  });
});
