import { googleSheetCsvUrl, parseGoogleSheetsUrl } from "@/core/parse/google-sheets";
import { sniffFileType } from "@/core/parse/sniff";
import { getConfig } from "./config";
import { HttpError } from "./http";

/**
 * Fetch a public Google Sheet as CSV (EC-A23, A24). The request goes to the fixed docs.google.com
 * export URL built from the parsed id, so there is no SSRF surface; redirects are followed by hand
 * and refused unless they stay on Google's document hosts. A private sheet answers with a login
 * page, which is turned into one clear message.
 */

export interface FetchedGoogleSheet {
  data: Buffer;
  /** "<title> - <tab>.csv" from Google's Content-Disposition, else "<sheet id>.csv". */
  fileName: string;
  sheetId: string;
  gid: string | null;
}

export interface FetchGoogleSheetOptions {
  /** Injected in tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

export const PRIVATE_SHEET_MESSAGE = "This sheet is not shared publicly. In Google Sheets choose Share → Anyone with the link → Viewer and try again.";

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_REDIRECTS = 5;
const ALLOWED_REDIRECT_HOSTS = /(?:^|\.)(?:docs\.google\.com|googleusercontent\.com)$/i;
const LOGIN_HOST = /(?:^|\.)accounts\.google\.com$/i;
const MAX_FILENAME_CHARS = 120;

export async function fetchGoogleSheetCsv(link: string, opts: FetchGoogleSheetOptions = {}): Promise<FetchedGoogleSheet> {
  const ref = parseGoogleSheetsUrl(link);
  if (!ref) throw new HttpError(400, "invalid_sheet_url", "That is not a Google Sheets link. Copy the link from the browser address bar or from Share → Copy link.");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxBytes = opts.maxBytes ?? getConfig().MAX_SHEET_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await follow(fetchImpl, googleSheetCsvUrl(ref), controller.signal);
    const data = await readBody(res, maxBytes, controller);
    if (sniffFileType(data).kind === "html") throw new HttpError(403, "sheet_private", PRIVATE_SHEET_MESSAGE);
    return { data, fileName: fileNameFrom(res.headers.get("content-disposition")) ?? `${ref.sheetId}.csv`, sheetId: ref.sheetId, gid: ref.gid };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (controller.signal.aborted) throw new HttpError(504, "sheet_timeout", "Google did not answer within 20 seconds. Try again, or download the sheet as CSV and upload it.");
    throw new HttpError(502, "sheet_fetch_failed", "The sheet could not be downloaded from Google. Try again, or download it as CSV and upload it.");
  } finally {
    clearTimeout(timer);
  }
}

/** Follows up to five redirects, each checked against the Google host allow-list. */
async function follow(fetchImpl: typeof fetch, url: string, signal: AbortSignal): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetchImpl(current, { redirect: "manual", signal, headers: { Accept: "text/csv,*/*;q=0.5", "User-Agent": "CatalogForge/1.0 (sheet import)" } });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => undefined);
      if (!location) throw new HttpError(502, "sheet_fetch_failed", "Google redirected without a destination; try again.");
      const next = new URL(location, current);
      if (LOGIN_HOST.test(next.hostname)) throw new HttpError(403, "sheet_private", PRIVATE_SHEET_MESSAGE);
      if (!ALLOWED_REDIRECT_HOSTS.test(next.hostname) || next.protocol !== "https:") {
        throw new HttpError(502, "sheet_redirect_refused", `Google redirected to ${next.hostname}, which is not a Google document host; the download was refused.`);
      }
      current = next.toString();
      continue;
    }
    if (res.ok) return res;
    await res.body?.cancel().catch(() => undefined);
    if (res.status === 401 || res.status === 403) throw new HttpError(403, "sheet_private", PRIVATE_SHEET_MESSAGE);
    if (res.status === 404) throw new HttpError(404, "sheet_not_found", "Google says this sheet does not exist. Check the link; if the tab was deleted, remove the #gid part.");
    throw new HttpError(502, "sheet_fetch_failed", `Google answered HTTP ${res.status} for this sheet. Try again, or download it as CSV and upload it.`);
  }
  throw new HttpError(502, "sheet_fetch_failed", "Google redirected too many times; download the sheet as CSV and upload it.");
}

/** Streams the body so a sheet over the cap is abandoned as soon as the cap is passed, not after a full download. */
async function readBody(res: Response, maxBytes: number, controller: AbortController): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge(maxBytes);
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      controller.abort();
      throw tooLarge(maxBytes);
    }
    chunks.push(Buffer.from(value));
  }
  const data = Buffer.concat(chunks);
  if (data.length === 0) throw new HttpError(400, "empty_file", "The sheet is empty.");
  return data;
}

function tooLarge(maxBytes: number): HttpError {
  return new HttpError(413, "sheet_too_large", `The sheet is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`);
}

/** `attachment; filename="Price list - Sheet1.csv"; filename*=UTF-8''Price%20list%20-%20Sheet1.csv` → a safe file name. */
export function fileNameFrom(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;
  let name: string | null = null;
  const star = /filename\*=(?:UTF-8|utf-8)''([^;]+)/.exec(contentDisposition);
  if (star) {
    try {
      name = decodeURIComponent(star[1].trim());
    } catch {
      name = null;
    }
  }
  if (!name) {
    const plain = /filename="((?:[^"\\]|\\.)*)"|filename=([^;]+)/.exec(contentDisposition);
    name = plain ? (plain[1] ?? plain[2]).replace(/\\(.)/g, "$1").trim() : null;
  }
  if (!name) return null;
  // Keep it a display name: no path separators or control characters, bounded, always .csv.
  const cleaned = name
    .replace(/[\\/\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.csv$/i, "")
    .slice(0, MAX_FILENAME_CHARS)
    .trim();
  return cleaned ? `${cleaned}.csv` : null;
}
