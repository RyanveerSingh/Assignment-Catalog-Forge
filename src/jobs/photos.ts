import { eq } from "drizzle-orm";
import { Readable } from "node:stream";
import sharp from "sharp";
import yauzl from "yauzl";
import { sniffFileType } from "@/core/parse/sniff";
import { matchPhotos } from "@/core/photos/match";
import { appendImportEvent, getImportById, listImportFiles } from "@/db/repositories/imports";
import { applyPhotoMatches, findPhotoBySha, groupsFromProducts, insertPhoto, listPhotosForImport } from "@/db/repositories/photos";
import { products } from "@/db/schema";
import type { Db } from "@/db/client";
import { getConfig } from "@/lib/config";
import { sha256Hex } from "@/lib/crypto";
import { getStorage } from "@/providers/storage";
import { JobError } from "@/queue/errors";
import type { JobHandler } from "@/worker/loop";

const MAX_INPUT_PIXELS = 80_000_000;
const MAX_ZIP_ENTRIES = 5_000;
const MAX_UNCOMPRESSED_RATIO = 100;

/**
 * Extract photos (single files or a ZIP), validate by magic bytes, resize to 800 px WebP plus a
 * 400 px thumbnail, deduplicate by content, store, then match to products (EC-A17, C12–C18, C20).
 * Idempotent: a photo already stored for this import (same sha256 and name) is skipped.
 */
export const photosHandler: JobHandler = async ({ job, db, log, signal }) => {
  const importId = job.importId;
  if (!importId) throw new JobError("photos job without importId", { retryable: false });
  const imp = await getImportById(db, importId);
  if (!imp) return;
  const storeId = imp.storeId;
  const cfg = getConfig();
  const storage = getStorage();
  const files = await listImportFiles(db, importId);
  const existing = await listPhotosForImport(db, importId);
  const seenNames = new Set(existing.map((p) => p.originalName));

  let accepted = 0;
  let rejected = 0;
  let skipped = 0;
  const rejections: string[] = [];

  async function handleImage(name: string, data: Buffer): Promise<void> {
    if (signal.aborted) throw new JobError("lease lost while processing photos", { retryable: true, retryAfterMs: 0 });
    if (seenNames.has(name)) {
      skipped += 1;
      return;
    }
    if (accepted + existing.length >= cfg.MAX_PHOTOS_PER_IMPORT) {
      rejections.push(`${name}: photo limit of ${cfg.MAX_PHOTOS_PER_IMPORT} reached`);
      rejected += 1;
      return;
    }
    const sniff = sniffFileType(data, name);
    if (sniff.kind !== "image" || !sniff.imageFormat) {
      rejections.push(`${name}: not an image (${sniff.kind})`);
      rejected += 1;
      return;
    }
    if (sniff.imageFormat === "svg") {
      rejections.push(`${name}: SVG is not accepted (can carry scripts)`);
      rejected += 1;
      return;
    }
    if (data.length > cfg.MAX_PHOTO_BYTES) {
      rejections.push(`${name}: larger than ${Math.round(cfg.MAX_PHOTO_BYTES / 1024 / 1024)} MB`);
      rejected += 1;
      return;
    }
    const sha256 = sha256Hex(data);
    const duplicate = await findPhotoBySha(db, storeId, sha256, name);
    if (duplicate && duplicate.originalName.toLowerCase() === name.toLowerCase()) {
      // The same file re-uploaded (same bytes, same name): it is already attached to its product (EC-C10).
      skipped += 1;
      seenNames.add(name);
      return;
    }
    try {
      let blobId: string;
      let thumbBlobId: string;
      let width: number;
      let height: number;
      if (duplicate) {
        // Same bytes under a different name: reuse the processed blobs (EC-C18).
        blobId = duplicate.blobId;
        thumbBlobId = duplicate.thumbBlobId;
        width = duplicate.width;
        height = duplicate.height;
      } else {
        const image = sharp(data, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate();
        const meta = await image.metadata();
        const main = await image.clone().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
        const thumb = await image.clone().resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true }).webp({ quality: 72 }).toBuffer();
        blobId = (await storage.put(storeId, main.data, "image/webp")).id;
        thumbBlobId = (await storage.put(storeId, thumb, "image/webp")).id;
        width = main.info.width;
        height = main.info.height;
        void meta;
      }
      await insertPhoto(db, { storeId, importId, blobId, thumbBlobId, sha256, originalName: name, width, height, status: "unmatched" });
      seenNames.add(name);
      accepted += 1;
    } catch (err) {
      rejections.push(`${name}: could not be decoded (${err instanceof Error ? err.message.slice(0, 80) : "corrupt"})`);
      rejected += 1;
    }
  }

  for (const f of files) {
    if (f.kind === "sheet") continue;
    const blob = await storage.get(storeId, f.blobId);
    if (!blob) {
      rejections.push(`${f.originalName}: missing from storage`);
      rejected += 1;
      continue;
    }
    if (f.kind === "photo") {
      await handleImage(f.originalName, blob.data);
      continue;
    }
    await readZip(blob.data, async (entryName, data) => handleImage(entryName, data), (reason) => {
      rejections.push(reason);
      rejected += 1;
    });
  }

  log.info({ accepted, rejected, skipped }, "photos processed");
  await appendImportEvent(db, importId, rejected > 0 ? "warn" : "info", `Photos: ${accepted} accepted, ${rejected} rejected, ${skipped} already stored`, {
    rejections: rejections.slice(0, 50),
  });
  const match = await rematchPhotos(db, importId);
  if (match) await appendImportEvent(db, importId, "info", `Photos matched: ${match.matched}, unmatched: ${match.unmatched}, missing references: ${match.missing}`);
};

/** Match every unmatched photo of an import against the products grouped so far (EC-C12, C13, C15). */
export async function rematchPhotos(db: Db, importId: string): Promise<{ matched: number; unmatched: number; missing: number } | null> {
  const existing = await listPhotosForImport(db, importId);
  const unmatched = existing.filter((p) => p.status === "unmatched");
  const productRows = await db.select({ group: products.group }).from(products).where(eq(products.lastImportId, importId));
  const groups = groupsFromProducts(productRows);
  if (groups.length === 0) return null;
  const result = matchPhotos(unmatched.map((p) => p.originalName), groups);
  const applied = await applyPhotoMatches(db, importId, result.matches);
  return { matched: applied.matched, unmatched: result.matches.filter((m) => m.method === "none").length, missing: result.missingReferences.length };
}

/** Streaming ZIP reader with bomb and traversal guards (EC-A17). Folder prefixes are stripped. */
async function readZip(buf: Buffer, onImage: (name: string, data: Buffer) => Promise<void>, onReject: (reason: string) => void): Promise<void> {
  const cfg = getConfig();
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(buf, { lazyEntries: true }, (err, zf) => (err || !zf ? reject(err ?? new Error("zip open failed")) : resolve(zf)));
  });
  let entries = 0;
  await new Promise<void>((resolve, reject) => {
    zip.readEntry();
    zip.on("entry", (entry: yauzl.Entry) => {
      entries += 1;
      if (entries > MAX_ZIP_ENTRIES) {
        onReject(`ZIP has more than ${MAX_ZIP_ENTRIES} entries; the rest were ignored`);
        zip.close();
        return resolve();
      }
      const rawName = entry.fileName;
      if (rawName.endsWith("/")) return zip.readEntry();
      const name = rawName.split(/[\\/]/).pop() ?? rawName;
      if (!name || name.startsWith(".") || name.includes("..")) return zip.readEntry();
      if (entry.uncompressedSize > cfg.MAX_PHOTO_BYTES || (entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > MAX_UNCOMPRESSED_RATIO)) {
        onReject(`${name}: suspicious size (${entry.uncompressedSize} bytes)`);
        return zip.readEntry();
      }
      zip.openReadStream(entry, (err, stream) => {
        if (err || !stream) {
          onReject(`${name}: unreadable entry`);
          return zip.readEntry();
        }
        const chunks: Buffer[] = [];
        let total = 0;
        (stream as Readable).on("data", (c: Buffer) => {
          total += c.length;
          if (total <= cfg.MAX_PHOTO_BYTES) chunks.push(c);
        });
        stream.on("end", () => {
          const data = Buffer.concat(chunks);
          void onImage(name, data).then(() => zip.readEntry(), reject);
        });
        stream.on("error", () => {
          onReject(`${name}: stream error`);
          zip.readEntry();
        });
      });
    });
    zip.on("end", () => resolve());
    zip.on("error", reject);
  });
}
