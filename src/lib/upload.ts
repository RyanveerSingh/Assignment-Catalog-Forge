import { sniffFileType } from "@/core/parse/sniff";
import type { Db } from "@/db/client";
import { attachImportFile, createImport, findActiveImportByHash, appendImportEvent, updateImport } from "@/db/repositories/imports";
import { requestDrive } from "@/jobs/drive";
import { getConfig } from "./config";
import { sha256Hex } from "./crypto";
import { HttpError } from "./http";
import { getStorage } from "@/providers/storage";

export interface UploadFile {
  name: string;
  data: Buffer;
}

export interface UploadInput {
  storeId: string;
  sheet: UploadFile;
  photos: UploadFile[];
  mode: "fast" | "economy";
  budgetCents?: number;
  name?: string;
}

export interface UploadResult {
  importId: string;
  reused: boolean;
  warnings: string[];
}

/**
 * Validate and store an upload, then hand it to the queue. The HTTP request returns as soon as
 * the files are persisted; all work happens in the background (EC-A1–A3, A17, E6).
 */
export async function acceptUpload(db: Db, input: UploadInput): Promise<UploadResult> {
  const cfg = getConfig();
  const warnings: string[] = [];
  const sheet = input.sheet;
  if (sheet.data.length === 0) throw new HttpError(400, "empty_file", "File is empty");
  if (sheet.data.length > cfg.MAX_SHEET_BYTES) throw new HttpError(413, "sheet_too_large", `Sheet is larger than ${Math.round(cfg.MAX_SHEET_BYTES / 1024 / 1024)} MB`);
  const sniff = sniffFileType(sheet.data, sheet.name);
  if (sniff.kind !== "csv" && sniff.kind !== "xlsx" && sniff.kind !== "xls") {
    throw new HttpError(415, "unsupported_sheet", describeRejection(sniff.kind, sheet.name));
  }
  if (sniff.extensionMismatch) warnings.push(`${sheet.name} looks like ${sniff.kind.toUpperCase()} despite its extension; it was read as ${sniff.kind.toUpperCase()}`);

  const photoFiles: Array<UploadFile & { kind: "photo" | "zip"; mime: string }> = [];
  for (const f of input.photos) {
    if (f.data.length === 0) {
      warnings.push(`${f.name} is empty and was ignored`);
      continue;
    }
    const s = sniffFileType(f.data, f.name);
    if (s.kind === "zip") {
      if (f.data.length > cfg.MAX_ZIP_BYTES) throw new HttpError(413, "zip_too_large", `${f.name} is larger than ${Math.round(cfg.MAX_ZIP_BYTES / 1024 / 1024)} MB`);
      photoFiles.push({ ...f, kind: "zip", mime: "application/zip" });
    } else if (s.kind === "image" && s.imageFormat !== "svg") {
      if (f.data.length > cfg.MAX_PHOTO_BYTES) throw new HttpError(413, "photo_too_large", `${f.name} is larger than ${Math.round(cfg.MAX_PHOTO_BYTES / 1024 / 1024)} MB`);
      photoFiles.push({ ...f, kind: "photo", mime: s.mime });
    } else {
      warnings.push(`${f.name} was ignored: ${s.kind === "image" ? "SVG is not accepted" : `not an image or ZIP (${s.kind})`}`);
    }
  }
  if (photoFiles.length > cfg.MAX_PHOTOS_PER_IMPORT) throw new HttpError(413, "too_many_photos", `At most ${cfg.MAX_PHOTOS_PER_IMPORT} photos per import`);

  const fileHash = sha256Hex(sheet.data);
  const active = await findActiveImportByHash(db, input.storeId, fileHash);
  if (active) return { importId: active.id, reused: true, warnings: [...warnings, "This exact file is already being imported; showing the running import"] };

  const storage = getStorage();
  const imp = await createImport(db, { storeId: input.storeId, name: input.name ?? sheet.name, mode: input.mode, budgetCents: input.budgetCents });
  const blob = await storage.put(input.storeId, sheet.data, sniff.mime);
  await attachImportFile(db, { importId: imp.id, storeId: input.storeId, kind: "sheet", blobId: blob.id, sha256: blob.sha256, size: blob.size, mime: sniff.mime, originalName: sheet.name });
  for (const f of photoFiles) {
    const b = await storage.put(input.storeId, f.data, f.mime);
    await attachImportFile(db, { importId: imp.id, storeId: input.storeId, kind: f.kind, blobId: b.id, sha256: b.sha256, size: b.size, mime: f.mime, originalName: f.name });
  }
  try {
    await updateImport(db, imp.id, { status: "queued", fileHash });
  } catch (err) {
    // Lost a race with an identical concurrent upload: point at the winner (EC-E6).
    const winner = await findActiveImportByHash(db, input.storeId, fileHash);
    if (winner && winner.id !== imp.id) {
      await updateImport(db, imp.id, { status: "cancelled", error: "duplicate of a concurrent upload" });
      return { importId: winner.id, reused: true, warnings: [...warnings, "This exact file was uploaded twice at once; showing the running import"] };
    }
    throw err;
  }
  await appendImportEvent(db, imp.id, "info", `Upload received: ${sheet.name}${photoFiles.length ? ` + ${photoFiles.length} photo file(s)` : ""}`, { warnings });
  await requestDrive(db, imp.id, input.storeId);
  return { importId: imp.id, reused: false, warnings };
}

function describeRejection(kind: string, name: string): string {
  switch (kind) {
    case "empty":
      return "File is empty";
    case "html":
      return `${name} is an HTML page, not a spreadsheet. Export the sheet as CSV or XLSX and try again`;
    case "pdf":
      return `${name} is a PDF. Export the sheet as CSV or XLSX and try again`;
    case "image":
      return `${name} is an image. Upload it in the photos field instead`;
    case "zip":
      return `${name} is a ZIP. Upload the sheet itself (CSV, XLSX or SQL dump) and put photos in the photos field`;
    case "xls":
      return `${name} is an old .xls workbook; please save it as .xlsx or .csv`;
    default:
      return `${name} is not a CSV, XLSX or SQL dump file`;
  }
}
