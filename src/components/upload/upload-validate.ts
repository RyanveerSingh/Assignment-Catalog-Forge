import { formatBytes } from "./file-row";

const MB = 1024 * 1024;
/** Mirrors the server defaults (MAX_SHEET_BYTES, MAX_PHOTO_BYTES, MAX_ZIP_BYTES); the server re-checks (EC-A3). */
const LIMITS = { sheet: 50 * MB, photo: 25 * MB, zip: 200 * MB } as const;
const SHEET_EXT = new Set(["csv", "xlsx", "xls", "sql"]);
const PHOTO_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);

export const ACCEPT = {
  "text/csv": [".csv"],
  "text/plain": [".csv", ".sql"],
  "application/sql": [".sql"],
  "application/x-sql": [".sql"],
  "application/vnd.ms-excel": [".xls", ".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "application/zip": [".zip"],
  "application/x-zip-compressed": [".zip"],
};

type FileKind = "sheet" | "photo" | "zip";

/** A validated Google Sheets link standing in for the sheet file (EC-A23). */
export interface SheetLink {
  url: string;
  gid: string | null;
}

export function extensionOf(name: string): string {
  return name.toLowerCase().split(".").pop() ?? "";
}

export function kindOf(file: File): FileKind | null {
  const ext = extensionOf(file.name);
  if (SHEET_EXT.has(ext)) return "sheet";
  if (PHOTO_EXT.has(ext)) return "photo";
  if (ext === "zip") return "zip";
  return null;
}

/** EC-A1 (empty), EC-A3 (limits) and the accepted extensions. EC-A2 (a lying extension) is settled by the server's magic-byte sniff. */
export function validateFile(file: File): { kind: FileKind } | { error: string } {
  const kind = kindOf(file);
  if (!kind) return { error: `${file.name}: not a supported type. Sheets are .csv, .xlsx, .xls or a .sql dump; photos are .png, .jpg, .jpeg, .webp or .gif; or one .zip of photos.` };
  if (file.size === 0) return { error: `${file.name} is empty (0 bytes)` };
  if (file.size > LIMITS[kind]) {
    const noun = kind === "sheet" ? "Sheets" : kind === "zip" ? "ZIP archives" : "Photos";
    return { error: `${file.name} is ${formatBytes(file.size)}. ${noun} are limited to ${LIMITS[kind] / MB} MB.` };
  }
  return { kind };
}

export function sameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

export function parseBody(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === "object" && v !== null ? { ...v } : null;
  } catch {
    return null;
  }
}

export function serverMessage(status: number, body: Record<string, unknown> | null): string {
  const err = body?.error;
  if (typeof err === "object" && err !== null && "message" in err && typeof err.message === "string") return err.message;
  switch (status) {
    case 401:
      return "Your session has expired. Sign in again and retry.";
    case 413:
      return "The upload is larger than the server accepts.";
    case 415:
      return "The sheet is not a CSV, XLSX or SQL file.";
    case 503:
      return "The database is temporarily unavailable; please retry.";
    default:
      return `Upload failed (HTTP ${status}).`;
  }
}
