import { getDb } from "@/db/client";
import { listImports } from "@/db/repositories/imports";
import { HttpError, json, parseIntParam, withApi } from "@/lib/http";
import { requireStore } from "@/lib/session";
import { acceptUpload, type UploadFile } from "@/lib/upload";

type Ctx = { params: Promise<{ slug: string }> };

export const GET = withApi(async (req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store } = await requireStore(slug);
  const url = new URL(req.url);
  const limit = parseIntParam(url.searchParams.get("limit"), 25, 1, 100);
  const offset = parseIntParam(url.searchParams.get("offset"), 0);
  const rows = await listImports(getDb(), store.id, { limit, offset });
  return json({ imports: rows.map(serializeImport) });
});

/** Multipart upload: `sheet` (one CSV/XLSX) plus any number of `photos` (images or ZIPs). Returns 202 immediately. */
export const POST = withApi(async (req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store } = await requireStore(slug);
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "invalid_form", "Expected multipart form data");
  const sheet = form.get("sheet");
  if (!(sheet instanceof File)) throw new HttpError(400, "missing_sheet", "Attach a CSV or XLSX file as 'sheet'");
  const photos: UploadFile[] = [];
  for (const entry of form.getAll("photos")) {
    if (entry instanceof File) photos.push({ name: entry.name, data: Buffer.from(await entry.arrayBuffer()) });
  }
  const mode = form.get("mode") === "economy" ? "economy" : "fast";
  const budgetRaw = form.get("budgetCents");
  const budgetCents = typeof budgetRaw === "string" && /^\d+$/.test(budgetRaw) ? Number(budgetRaw) : undefined;
  const result = await acceptUpload(getDb(), {
    storeId: store.id,
    sheet: { name: sheet.name, data: Buffer.from(await sheet.arrayBuffer()) },
    photos,
    mode,
    budgetCents,
  });
  return json(result, { status: result.reused ? 200 : 202 });
});

export function serializeImport(row: Awaited<ReturnType<typeof listImports>>[number]) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    mode: row.mode,
    totalRows: row.totalRows,
    counts: row.counts,
    productCount: row.productCount,
    pausedUntil: row.pausedUntil?.toISOString() ?? null,
    pauseReason: row.pauseReason,
    costMicros: row.costMicros,
    costSummary: row.costSummary,
    budgetCents: row.budgetCents,
    error: row.error,
    parseMeta: row.parseMeta,
    columnMap: row.columnMap,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
