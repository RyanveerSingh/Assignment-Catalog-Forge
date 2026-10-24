import { getConfig } from "./config";
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
  /** "Publish products that pass every check" on the upload form, or `autoPublish: true` in JSON. */
  autoPublish?: boolean;
}

export const MISSING_SHEET_MESSAGE = "Attach a CSV, XLSX or SQL dump as 'sheet', or send a Google Sheets link as 'sheetUrl'";

/** Byte limits checked before and while reading the body; defaults come from the config (EC-A3). */
export interface UploadLimits {
  maxUploadBytes: number;
  maxSheetBytes: number;
  maxPhotoBytes: number;
  maxZipBytes: number;
  maxPhotos: number;
}

/** A JSON body only carries a link and two scalars. */
const MAX_JSON_BYTES = 64 * 1024;

function limitsFromConfig(): UploadLimits {
  const cfg = getConfig();
  return { maxUploadBytes: cfg.MAX_UPLOAD_BYTES, maxSheetBytes: cfg.MAX_SHEET_BYTES, maxPhotoBytes: cfg.MAX_PHOTO_BYTES, maxZipBytes: cfg.MAX_ZIP_BYTES, maxPhotos: cfg.MAX_PHOTOS_PER_IMPORT };
}

export function formatMb(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

export async function readImportRequest(req: Request, limits: UploadLimits = limitsFromConfig()): Promise<ImportRequest> {
  const contentType = req.headers.get("content-type") ?? "";
  const isJson = /^application\/json\b/i.test(contentType);
  checkDeclaredLength(req, isJson ? MAX_JSON_BYTES : limits.maxUploadBytes, isJson);
  if (isJson) return fromJson(req, MAX_JSON_BYTES);
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, "invalid_form", "Expected multipart form data, or a JSON body with 'sheetUrl'");
  return fromForm(form, limits);
}

/**
 * The form parser buffers the whole body before any per-file check can run, so the size is judged
 * from Content-Length first. The server never reads past the declared length, which makes it a hard
 * bound. Without it (a chunked upload) a multipart body has no bound and is refused.
 */
function checkDeclaredLength(req: Request, maxBytes: number, isJson: boolean): void {
  const header = req.headers.get("content-length");
  if (header === null || header.trim() === "") {
    if (isJson) return;
    throw new HttpError(411, "length_required", "Uploads must declare their size (Content-Length); chunked multipart uploads are not accepted");
  }
  const declared = Number(header);
  if (!Number.isSafeInteger(declared) || declared < 0) throw new HttpError(400, "invalid_content_length", "Content-Length is not a valid size");
  if (declared > maxBytes) {
    if (isJson) throw new HttpError(413, "request_too_large", `A JSON import request may be at most ${formatMb(maxBytes)}; send the sheet as a file or a link`);
    throw new HttpError(413, "upload_too_large", `The upload is ${formatMb(declared)}; at most ${formatMb(maxBytes)} can be sent in one import. Send fewer or smaller photos, or split them across several imports`);
  }
}

async function fromJson(req: Request, maxBytes: number): Promise<ImportRequest> {
  const body = parseJson(await readBoundedText(req, maxBytes));
  if (typeof body !== "object" || body === null) throw new HttpError(400, "invalid_json", "Expected a JSON object with 'sheetUrl'");
  const o = body as Record<string, unknown>;
  const sheetUrl = typeof o.sheetUrl === "string" ? o.sheetUrl.trim() : "";
  if (!sheetUrl) throw new HttpError(400, "missing_sheet", MISSING_SHEET_MESSAGE);
  return { ...(await sheetFromLink(sheetUrl)), photos: [], mode: modeOf(o.mode), budgetCents: budgetOf(o.budgetCents), autoPublish: o.autoPublish === true };
}

async function fromForm(form: FormData, limits: UploadLimits): Promise<ImportRequest> {
  const file = form.get("sheet");
  const sheetUrl = form.get("sheetUrl");
  const link = typeof sheetUrl === "string" ? sheetUrl.trim() : "";
  if (file instanceof File && link) throw new HttpError(400, "ambiguous_sheet", "Send either a sheet file or a sheetUrl, not both");
  const photos: UploadFile[] = [];
  // Count and per-file limits are checked on the parsed Files, before each copy into a Buffer.
  const photoEntries = form.getAll("photos").filter((e): e is File => e instanceof File);
  if (photoEntries.length > limits.maxPhotos) throw new HttpError(413, "too_many_photos", `At most ${limits.maxPhotos} photos per import; ${photoEntries.length} were sent. Put them in a ZIP or split them across imports`);
  for (const entry of photoEntries) {
    const max = /\.zip$/i.test(entry.name) ? limits.maxZipBytes : Math.max(limits.maxPhotoBytes, limits.maxZipBytes);
    if (entry.size > max) throw new HttpError(413, /\.zip$/i.test(entry.name) ? "zip_too_large" : "photo_too_large", `${entry.name} is larger than ${formatMb(max)}`);
    photos.push({ name: entry.name, data: Buffer.from(await entry.arrayBuffer()) });
  }
  const mode = modeOf(form.get("mode"));
  const budgetCents = budgetOf(form.get("budgetCents"));
  const autoPublish = ["true", "on", "1"].includes(String(form.get("autoPublish") ?? ""));
  if (link) return { ...(await sheetFromLink(link)), photos, mode, budgetCents, autoPublish };
  if (!(file instanceof File)) throw new HttpError(400, "missing_sheet", MISSING_SHEET_MESSAGE);
  if (file.size > limits.maxSheetBytes) throw new HttpError(413, "sheet_too_large", `Sheet is larger than ${formatMb(limits.maxSheetBytes)}`);
  return { sheet: { name: file.name, data: Buffer.from(await file.arrayBuffer()) }, photos, mode, budgetCents, autoPublish };
}

/** A body without Content-Length is read up to the cap and no further. */
async function readBoundedText(req: Request, maxBytes: number): Promise<string> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(413, "request_too_large", `A JSON import request may be at most ${formatMb(maxBytes)}; send the sheet as a file or a link`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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
