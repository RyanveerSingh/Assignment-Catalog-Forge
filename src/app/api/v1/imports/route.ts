import { getDb } from "@/db/client";
import { listImports } from "@/db/repositories/imports";
import { HttpError, json, parseIntParam, withApi } from "@/lib/http";
import { requireApiKeyStore } from "@/lib/session";
import { acceptUpload, type UploadFile } from "@/lib/upload";
import { serializeImport } from "@/lib/serializers";

/**
 * Public import API (Bearer `cf_live_…` key, created in Settings).
 *   POST /api/v1/imports   multipart: sheet=<file> photos=<file>… mode=fast|economy
 *   GET  /api/v1/imports   list
 * Returns 202 with the import id; poll GET /api/v1/imports/{id}.
 */
export const POST = withApi(async (req: Request) => {
  const { storeId } = await requireApiKeyStore(req);
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "invalid_form", "Expected multipart form data with a 'sheet' file");
  const sheet = form.get("sheet");
  if (!(sheet instanceof File)) throw new HttpError(400, "missing_sheet", "Attach a CSV or XLSX file as 'sheet'");
  const photos: UploadFile[] = [];
  for (const entry of form.getAll("photos")) if (entry instanceof File) photos.push({ name: entry.name, data: Buffer.from(await entry.arrayBuffer()) });
  const mode = form.get("mode") === "economy" ? "economy" : "fast";
  const result = await acceptUpload(getDb(), { storeId, sheet: { name: sheet.name, data: Buffer.from(await sheet.arrayBuffer()) }, photos, mode });
  return json({ importId: result.importId, reused: result.reused, warnings: result.warnings, statusUrl: `/api/v1/imports/${result.importId}` }, { status: result.reused ? 200 : 202 });
});

export const GET = withApi(async (req: Request) => {
  const { storeId } = await requireApiKeyStore(req);
  const url = new URL(req.url);
  const rows = await listImports(getDb(), storeId, { limit: parseIntParam(url.searchParams.get("limit"), 25, 1, 100), offset: parseIntParam(url.searchParams.get("offset"), 0) });
  return json({ imports: rows.map(serializeImport) });
});
