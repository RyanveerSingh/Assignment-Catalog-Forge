/**
 * Synthetic sample generator for CatalogForge.
 *
 *   npx tsx scripts/generate-samples.ts [--out samples] [--seed 42]
 *
 * Writes deliberately messy supplier sheets, a matching photo ZIP and ground-truth JSON for
 * the evaluation harness. Everything is a pure function of the seed: the same seed gives
 * byte-identical CSV/JSON (and, on the same libvips build, identical images and ZIP).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as iconv from "iconv-lite";
import { validateCatalog } from "./lib/catalog";
import { buildZip, renderImage, type ZipEntry } from "./lib/photos";
import { createPrng } from "./lib/prng";
import { rowsToMatrix } from "./lib/rows";
import { buildBulk } from "./lib/sample-bulk";
import { buildMessy, type PhotoPlanEntry } from "./lib/sample-messy";
import { buildLatin1, buildSemicolon, buildTiny, FAKE_HTML, SEMICOLON_HEADER_LINE } from "./lib/sample-small";
import { groundTruthJson, toCsv, toXlsx } from "./lib/writers";

export interface GenerateOptions {
  outDir: string;
  seed: number;
  /** Print the per-row mess log for messy-120 (what the README is written from). */
  verbose?: boolean;
}

export interface GeneratedFile {
  /** Path relative to `outDir`, forward slashes. */
  name: string;
  bytes: number;
  summary: string;
}

async function renderPhotoZip(plan: PhotoPlanEntry[]): Promise<ZipEntry[]> {
  const rendered = new Map<string, Buffer>();
  for (const entry of plan) {
    if (entry.kind === "image") rendered.set(entry.name, await renderImage(entry.spec));
    else if (entry.kind === "bytes") rendered.set(entry.name, entry.data);
  }
  for (const entry of plan) {
    if (entry.kind !== "copy") continue;
    const source = rendered.get(entry.of);
    if (!source) throw new Error(`photo plan: copy of unknown entry ${entry.of}`);
    rendered.set(entry.name, source);
  }
  // Sorted like a real archive; plain comparison so the order does not depend on the locale.
  return [...rendered.entries()].map(([name, data]) => ({ name, data })).sort((a, b) => (a.name < b.name ? -1 : 1));
}

export async function generateSamples(opts: GenerateOptions): Promise<GeneratedFile[]> {
  validateCatalog();
  const { outDir, seed } = opts;
  mkdirSync(join(outDir, "ground-truth"), { recursive: true });
  const root = createPrng(seed);
  const files: GeneratedFile[] = [];
  const write = (name: string, data: string | Buffer, summary: string): void => {
    const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
    writeFileSync(join(outDir, name), buf);
    files.push({ name, bytes: buf.length, summary });
  };
  const headersOf = (columns: { header: string }[]): string[] => columns.map((c) => c.header);

  // --- tiny-10, no-header, header-only, empty, fake
  const tiny = buildTiny(seed);
  const tinyMatrix = rowsToMatrix(tiny.rows, tiny.columns);
  write("tiny-10.csv", toCsv(headersOf(tiny.columns), tinyMatrix), `${tiny.rows.length} clean rows, ${tiny.groundTruth.products.length} products`);
  write("ground-truth/tiny-10.json", groundTruthJson(tiny.groundTruth, false), `${tiny.groundTruth.products.length} products`);
  write("no-header.csv", toCsv(null, tinyMatrix), `${tinyMatrix.length} data rows, no header row (EC-A9)`);
  write("header-only.csv", toCsv(headersOf(tiny.columns), []), "header row only (EC-A16)");
  write("empty.csv", Buffer.alloc(0), "0 bytes (EC-A1)");
  write("fake.csv", FAKE_HTML, "HTML page with a .csv extension (EC-A2)");

  // --- messy-120 (CSV + XLSX + photos)
  const messy = buildMessy(root, seed);
  if (opts.verbose) for (const line of messy.log) console.log(`messy-120 ${line}`);
  const messyMatrix = rowsToMatrix(messy.rows, messy.columns);
  const messyHeaders = headersOf(messy.columns);
  const messySummary = `${messy.rows.length} rows, ${messy.groundTruth.products.length} products, ${messy.groundTruth.duplicateRows.length} duplicates`;
  write("messy-120.csv", toCsv(messyHeaders, messyMatrix, { bom: true }), `${messySummary}, UTF-8 BOM`);
  write("messy-120.xlsx", toXlsx([["Supplier price list"], ["Updated 2026-10"]], messyHeaders, messyMatrix), `${messySummary}, 2 title rows, empty "Notes" sheet`);
  write("ground-truth/messy-120.json", groundTruthJson(messy.groundTruth, false), `${messy.groundTruth.products.length} products, ${messy.groundTruth.unmatchedPhotos.length} unmatched photos`);
  const zipEntries = await renderPhotoZip(messy.photoPlan);
  write("photos-messy.zip", await buildZip(zipEntries), `${zipEntries.length} entries`);

  // --- semicolon-eu
  const semi = buildSemicolon(seed);
  const semiCsv = `${SEMICOLON_HEADER_LINE}\n${toCsv(null, rowsToMatrix(semi.rows, semi.columns), { delimiter: ";" })}`;
  write("semicolon-eu.csv", semiCsv, `${semi.rows.length} German rows, ';' delimiter, ${semi.groundTruth.products.length} products`);
  write("ground-truth/semicolon-eu.json", groundTruthJson(semi.groundTruth, false), `${semi.groundTruth.products.length} products`);

  // --- broken-latin1 (windows-1252)
  const latin = buildLatin1();
  const latinText = toCsv(headersOf(latin.columns), rowsToMatrix(latin.rows, latin.columns), { delimiter: ";" });
  const latinBytes = iconv.encode(latinText, "win1252");
  if (iconv.decode(latinBytes, "win1252") !== latinText) throw new Error("broken-latin1: text is not representable in windows-1252");
  write("broken-latin1.csv", latinBytes, `${latin.rows.length} German rows encoded as windows-1252 (EC-A4)`);

  // --- bulk
  for (const [name, total] of [
    ["bulk-1000", 1000],
    ["bulk-10000", 10_000],
  ] as const) {
    const bulk = buildBulk(root, seed, name, total);
    const s = bulk.stats;
    write(
      `${name}.csv`,
      toCsv(headersOf(bulk.columns), rowsToMatrix(bulk.rows, bulk.columns)),
      `${bulk.rows.length} rows, ${s.products} products (${s.germanProducts} German), ${s.messyRows} messy rows, ${s.duplicates} duplicates, ${s.conflicts} SKU conflicts, ${s.scatteredProducts} scattered`,
    );
    write(`ground-truth/${name}.json`, groundTruthJson(bulk.groundTruth, true), `${bulk.groundTruth.products.length} products`);
  }

  return files;
}

function parseArgs(argv: string[]): GenerateOptions {
  const opts: GenerateOptions = { outDir: "samples", seed: 42 };
  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = argv[i].split("=", 2);
    if (flag === "--verbose") {
      opts.verbose = true;
      continue;
    }
    const value = inline ?? argv[++i];
    if (flag === "--out") opts.outDir = value;
    else if (flag === "--seed") {
      opts.seed = Number.parseInt(value, 10);
      if (!Number.isInteger(opts.seed)) throw new Error(`--seed must be an integer, got ${value}`);
    } else throw new Error(`unknown argument ${flag}`);
  }
  return opts;
}

const invokedDirectly = /generate-samples\.ts$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  const opts = parseArgs(process.argv.slice(2));
  generateSamples(opts)
    .then((files) => {
      for (const f of files) console.log(`${f.name.padEnd(32)} ${String(f.bytes).padStart(9)} B  ${f.summary}`);
      console.log(`wrote ${files.length} files to ${opts.outDir} (seed ${opts.seed})`);
    })
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    });
}
