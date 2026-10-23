import { fetchGoogleSheetCsv } from "./fetch-google-sheet";
import { HttpError } from "./http";
import type { UploadFile } from "./upload";

/**
 * One reader for both import routes. Accepts multipart form data (`sheet` file, `photos`, `mode`,
 * `budgetCents`, or `sheetUrl` in place of the file) or a JSON body (`{ sheetUrl, mode, budgetCents }`).
 * A Google Sheets link is fetched here so the result is indistinguishable from an uploaded CSV.
 */

export interface ImportRequest {
  sheet: UploadFile;
  photos: UploadFile[];
  mode: "fast" | "economy";
  budgetCents?: number;
  /** Set when the sheet came from a link; used as the import's display name. */
  name?: string;
}

export const MISSING_SHEET_MESSAGE = "Attach a CSV, XLSX or SQL dump as 'sheet', or send a Google Sheets link as 'sheetUrl'";

export async function readImportRequest(req: Request): Promise<ImportRequest> {
  const contentType = req.headers.get("content-type") ?? "";
  if (/^application\/json\b/i.test(contentType)) return fromJson(req);
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "invalid_form", "Expected multipart form data, or a JSON body with 'sheetUrl'");
  return fromForm(form);
}

async function fromJson(req: Request): Promise<ImportRequest> {
  const body: unknown = await req.json().catch(() => null);
  if (typeof body !== "object" || body === null) throw new HttpError(400, "invalid_json", "Expected a JSON object with 'sheetUrl'");
  const o = body as Record<string, unknown>;
  const sheetUrl = typeof o.sheetUrl === "string" ? o.sheetUrl.trim() : "";
  if (!sheetUrl) throw new HttpError(400, "missing_sheet", MISSING_SHEET_MESSAGE);
  return { ...(await sheetFromLink(sheetUrl)), photos: [], mode: modeOf(o.mode), budgetCents: budgetOf(o.budgetCents) };
}

async function fromForm(form: FormData): Promise<ImportRequest> {
  const file = form.get("sheet");
  const sheetUrl = form.get("sheetUrl");
  const link = typeof sheetUrl === "string" ? sheetUrl.trim() : "";
  if (file instanceof File && link) throw new HttpError(400, "ambiguous_sheet", "Send either a sheet file or a sheetUrl, not both");
  const photos: UploadFile[] = [];
  for (const entry of form.getAll("photos")) {
    if (entry instanceof File) photos.push({ name: entry.name, data: Buffer.from(await entry.arrayBuffer()) });
  }
  const mode = modeOf(form.get("mode"));
  const budgetCents = budgetOf(form.get("budgetCents"));
  if (link) return { ...(await sheetFromLink(link)), photos, mode, budgetCents };
  if (!(file instanceof File)) throw new HttpError(400, "missing_sheet", MISSING_SHEET_MESSAGE);
  return { sheet: { name: file.name, data: Buffer.from(await file.arrayBuffer()) }, photos, mode, budgetCents };
}

async function sheetFromLink(link: string): Promise<Pick<ImportRequest, "sheet" | "name">> {
  const fetched = await fetchGoogleSheetCsv(link);
  return { sheet: { name: fetched.fileName, data: fetched.data }, name: fetched.fileName };
}

function modeOf(value: unknown): "fast" | "economy" {
  return value === "economy" ? "economy" : "fast";
}

function budgetOf(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0 ? value : undefined;
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : undefined;
}
