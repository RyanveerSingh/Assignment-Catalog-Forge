/**
 * Synthetic product photos (sharp from SVG) and the photo ZIP (yazl) for the samples.
 * Image bytes are deterministic for a given libvips build; ZIP metadata is pinned.
 */

import sharp from "sharp";
import { ZipFile } from "yazl";
import type { Prng } from "./prng";

export type ImageFormat = "jpg" | "png";

export interface ImageSpec {
  sku: string;
  title: string;
  /** Base colour; the background is a pastel tint of it. */
  hex: string;
  format: ImageFormat;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`bad hex colour ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;
}

/** Blend towards white: amount 0 = original, 1 = white. */
function tint(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount]);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const FONT = "Arial, Helvetica, 'DejaVu Sans', sans-serif";

export function productSvg(spec: ImageSpec): string {
  const bg = tint(spec.hex, 0.72);
  const shape = tint(spec.hex, 0.25);
  const shadow = tint(spec.hex, 0.55);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">` +
    `<rect width="600" height="600" fill="${bg}"/>` +
    `<ellipse cx="300" cy="400" rx="170" ry="26" fill="${shadow}"/>` +
    `<circle cx="300" cy="250" r="140" fill="${shape}"/>` +
    `<text x="300" y="470" font-family="${FONT}" font-size="44" font-weight="bold" text-anchor="middle" fill="#2b2b2b">${escapeXml(spec.sku)}</text>` +
    `<text x="300" y="520" font-family="${FONT}" font-size="26" text-anchor="middle" fill="#4a4a4a">${escapeXml(spec.title)}</text>` +
    `</svg>`
  );
}

/** 600×600 JPEG or PNG, comfortably under 40 KB. */
export async function renderImage(spec: ImageSpec): Promise<Buffer> {
  const input = sharp(Buffer.from(productSvg(spec)));
  const out =
    spec.format === "png"
      ? await input.png({ palette: true, colours: 32, compressionLevel: 9 }).toBuffer()
      : await input.jpeg({ quality: 78, mozjpeg: false }).toBuffer();
  if (out.length > 40_000) throw new Error(`image ${spec.sku} is ${out.length} bytes (> 40 KB)`);
  return out;
}

/** Bytes that are not an image at all (EC-C16). Seeded, so the file is reproducible. */
export function randomBytes(prng: Prng, length: number): Buffer {
  const buf = Buffer.alloc(length);
  for (let i = 0; i < length; i++) buf[i] = prng.int(0, 255);
  return buf;
}

export const LOGO_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60" viewBox="0 0 200 60">` +
  `<rect width="200" height="60" rx="8" fill="#2e5d3a"/>` +
  `<text x="100" y="38" font-family="Arial, sans-serif" font-size="22" text-anchor="middle" fill="#fff">Casa Tierra</text>` +
  `<script>alert('svg')</script>` +
  `</svg>`;

export const README_TXT =
  "Product photos for the autumn price list.\n" +
  "File names follow the article number; _2 and (1) are additional views.\n" +
  "Please contact the trade desk for high-resolution originals.\n";

export interface ZipEntry {
  /** Path inside the archive, forward slashes. */
  name: string;
  data: Buffer;
}

const ZIP_MTIME = new Date("2026-10-01T12:00:00Z");

/** Deterministic ZIP: fixed entry order and timestamps, deflate on everything. */
export function buildZip(entries: ZipEntry[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new ZipFile();
    const chunks: Buffer[] = [];
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on("error", reject);
    for (const entry of entries) {
      zip.addBuffer(entry.data, entry.name, { mtime: ZIP_MTIME, compress: true, forceDosTimestamp: true });
    }
    zip.end();
  });
}
