/**
 * Magic-byte file-type sniffing (EC-A1, A2, A17). Extensions lie; the first bytes do not.
 */

import { decodeText } from "./encoding";

export type FileKind = "csv" | "xlsx" | "xls" | "zip" | "image" | "pdf" | "html" | "empty" | "unknown";
export type ImageFormat = "png" | "jpeg" | "webp" | "gif" | "svg" | "heic" | "bmp" | "tiff";

export interface SniffResult {
  kind: FileKind;
  mime: string;
  imageFormat?: ImageFormat;
  /** True when a filename extension was given and disagrees with the sniffed kind. */
  extensionMismatch: boolean;
}

type Detection = Omit<SniffResult, "extensionMismatch">;

const KIND_MIME: Record<Exclude<FileKind, "image">, string> = {
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  zip: "application/zip",
  pdf: "application/pdf",
  html: "text/html",
  empty: "inode/x-empty",
  unknown: "application/octet-stream",
};

const IMAGE_MIME: Record<ImageFormat, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  heic: "image/heic",
  bmp: "image/bmp",
  tiff: "image/tiff",
};

/** What a filename extension claims. A Map so odd extensions like "constructor" cannot hit Object.prototype. */
const EXTENSION_CLAIMS: ReadonlyMap<string, { kind: FileKind; imageFormat?: ImageFormat }> = new Map([
  ["csv", { kind: "csv" }],
  ["txt", { kind: "csv" }],
  ["tsv", { kind: "csv" }],
  ["xlsx", { kind: "xlsx" }],
  ["xlsm", { kind: "xlsx" }],
  ["xls", { kind: "xls" }],
  ["zip", { kind: "zip" }],
  ["pdf", { kind: "pdf" }],
  ["html", { kind: "html" }],
  ["htm", { kind: "html" }],
  ["png", { kind: "image", imageFormat: "png" }],
  ["jpg", { kind: "image", imageFormat: "jpeg" }],
  ["jpeg", { kind: "image", imageFormat: "jpeg" }],
  ["webp", { kind: "image", imageFormat: "webp" }],
  ["gif", { kind: "image", imageFormat: "gif" }],
  ["svg", { kind: "image", imageFormat: "svg" }],
  ["heic", { kind: "image", imageFormat: "heic" }],
  ["heif", { kind: "image", imageFormat: "heic" }],
  ["bmp", { kind: "image", imageFormat: "bmp" }],
  ["tif", { kind: "image", imageFormat: "tiff" }],
  ["tiff", { kind: "image", imageFormat: "tiff" }],
]);

const HEIF_BRANDS = new Set(["ftypheic", "ftypheix", "ftypmif1", "ftyphevc", "ftypheif"]);

const TEXT_SAMPLE_BYTES = 4096;
const ZIP_SCAN_BYTES = 64 * 1024;
const HTML_SCAN_CHARS = 512;
const SVG_SCAN_CHARS = 1024;
const PRINTABLE_THRESHOLD = 0.95;

export function sniffFileType(buf: Buffer, filename?: string): SniffResult {
  const detected = detect(buf);
  return { ...detected, extensionMismatch: extensionDisagrees(detected, filename) };
}

function detect(buf: Buffer): Detection {
  if (buf.length === 0) return kindResult("empty");

  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    const head = buf.subarray(0, ZIP_SCAN_BYTES).toString("latin1");
    return kindResult(head.includes("[Content_Types].xml") || head.includes("xl/") ? "xlsx" : "zip");
  }
  // An empty ZIP archive is just the end-of-central-directory record.
  if (startsWith(buf, [0x50, 0x4b, 0x05, 0x06])) return kindResult("zip");
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0])) return kindResult("xls");
  if (startsWith(buf, "%PDF")) return kindResult("pdf");

  const image = detectBinaryImage(buf);
  if (image) return imageResult(image);

  return detectText(buf);
}

function detectBinaryImage(buf: Buffer): ImageFormat | null {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return "png";
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(buf, "RIFF") && buf.length >= 12 && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  if (startsWith(buf, "GIF8")) return "gif";
  if (buf.length >= 12 && HEIF_BRANDS.has(buf.subarray(4, 12).toString("latin1"))) return "heic";
  if (startsWith(buf, [0x49, 0x49, 0x2a, 0x00]) || startsWith(buf, [0x4d, 0x4d, 0x00, 0x2a])) return "tiff";
  if (startsWith(buf, "BM") && looksLikeBmpHeader(buf)) return "bmp";
  return null;
}

/** "BM" alone is too weak: a CSV whose first header is "BMW" starts the same way. */
function looksLikeBmpHeader(buf: Buffer): boolean {
  if (buf.length < 14) return false;
  const declaredSize = buf.readUInt32LE(2);
  const reservedZero = buf[6] === 0 && buf[7] === 0 && buf[8] === 0 && buf[9] === 0;
  return reservedZero || declaredSize === buf.length;
}

function detectText(buf: Buffer): Detection {
  const sample = decodeText(buf.subarray(0, TEXT_SAMPLE_BYTES)).text;
  const lead = sample.replace(/^﻿/, "").trimStart().slice(0, SVG_SCAN_CHARS).toLowerCase();

  const svgAt = lead.indexOf("<svg");
  const htmlAt = lead.indexOf("<html");
  const svgFirst = svgAt !== -1 && (htmlAt === -1 || svgAt < htmlAt);
  if (lead.startsWith("<svg") || (lead.startsWith("<?xml") && svgFirst)) return imageResult("svg");

  const head = lead.slice(0, HTML_SCAN_CHARS);
  if (head.includes("<!doctype html") || head.includes("<html")) return kindResult("html");

  return kindResult(printableRatio(sample) >= PRINTABLE_THRESHOLD ? "csv" : "unknown");
}

function printableRatio(text: string): number {
  if (text.length === 0) return 1;
  let printable = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const control = code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f);
    const whitespace = code === 0x09 || code === 0x0a || code === 0x0d || code === 0x0b || code === 0x0c;
    const invalid = code === 0xfffd || code === 0xfffe || code === 0xffff;
    if (whitespace || (!control && !invalid)) printable++;
  }
  return printable / text.length;
}

// ---------------------------------------------------------------------------
// Extension agreement
// ---------------------------------------------------------------------------

function extensionDisagrees(detected: Detection, filename?: string): boolean {
  if (!filename || detected.kind === "empty") return false;
  const ext = extensionOf(filename);
  const claim = ext ? EXTENSION_CLAIMS.get(ext) : undefined;
  if (!claim) return false;
  if (claim.kind !== detected.kind) return true;
  return claim.kind === "image" && claim.imageFormat !== detected.imageFormat;
}

function extensionOf(filename: string): string | null {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : null;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function startsWith(buf: Buffer, prefix: string | number[]): boolean {
  if (typeof prefix === "string") {
    return buf.length >= prefix.length && buf.subarray(0, prefix.length).toString("latin1") === prefix;
  }
  if (buf.length < prefix.length) return false;
  return prefix.every((byte, i) => buf[i] === byte);
}

function kindResult(kind: Exclude<FileKind, "image">): Detection {
  return { kind, mime: KIND_MIME[kind] };
}

function imageResult(imageFormat: ImageFormat): Detection {
  return { kind: "image", mime: IMAGE_MIME[imageFormat], imageFormat };
}
