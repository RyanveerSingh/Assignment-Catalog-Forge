import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Papa from "papaparse";
import * as yauzl from "yauzl";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TAXONOMY } from "@/core/ai/taxonomy";
import type { GroundTruthFile } from "@/core/types";
import { generateSamples } from "./generate-samples";

const SEED = 42;
const GROUND_TRUTHS = ["tiny-10", "messy-120", "semicolon-eu", "bulk-1000", "bulk-10000"] as const;

let dir: string;

function parseCsv(name: string, delimiter?: string): string[][] {
  const text = readFileSync(join(dir, name), "utf8").replace(/^﻿/, "");
  return Papa.parse<string[]>(text, { delimiter, skipEmptyLines: true }).data;
}

function readTruth(name: string): GroundTruthFile {
  return JSON.parse(readFileSync(join(dir, "ground-truth", `${name}.json`), "utf8")) as GroundTruthFile;
}

function zipEntries(path: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      const names: string[] = [];
      zipfile.on("entry", (entry: yauzl.Entry) => {
        names.push(entry.fileName);
        zipfile.readEntry();
      });
      zipfile.on("end", () => resolve(names));
      zipfile.on("error", reject);
      zipfile.readEntry();
    });
  });
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "catalogforge-samples-"));
  await generateSamples({ outDir: dir, seed: SEED });
}, 120_000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("generate-samples", () => {
  it("messy-120.csv has 120 data rows", () => {
    expect(parseCsv("messy-120.csv").length - 1).toBe(120);
  });

  it("bulk-10000.csv has exactly 10,000 data rows and stays under 4 MB", () => {
    expect(parseCsv("bulk-10000.csv").length - 1).toBe(10_000);
    expect(readFileSync(join(dir, "bulk-10000.csv")).length).toBeLessThan(4 * 1024 * 1024);
  });

  it("bulk-1000.csv has exactly 1,000 data rows", () => {
    expect(parseCsv("bulk-1000.csv").length - 1).toBe(1000);
  });

  it.each(GROUND_TRUTHS)("%s ground truth references only existing rows, each row at most once", (name) => {
    const rowCount = parseCsv(`${name}.csv`, name === "semicolon-eu" ? ";" : undefined).length - 1;
    const truth = readTruth(name);
    expect(truth.seed).toBe(SEED);
    expect(truth.generatedAt).toBe(`seed-${SEED}`);
    const seen = new Set<number>();
    for (const product of truth.products) {
      expect(product.sourceRows.length).toBeGreaterThan(0);
      for (const row of product.sourceRows) {
        expect(row).toBeGreaterThanOrEqual(1);
        expect(row).toBeLessThanOrEqual(rowCount);
        expect(seen.has(row)).toBe(false);
        seen.add(row);
      }
      if (product.expectedStatus === "needs_review") expect(product.expectedReviewReasons.length).toBeGreaterThan(0);
    }
    for (const dup of truth.duplicateRows) {
      expect(dup.of).toBeLessThan(dup.row);
      expect(dup.row).toBeLessThanOrEqual(rowCount);
      expect(seen.has(dup.row)).toBe(false);
      seen.add(dup.row);
    }
    expect(seen.size).toBe(rowCount);
  });

  it.each(GROUND_TRUTHS)("EC-D3: every %s categoryPrefix is a TAXONOMY path or a strict prefix of one", (name) => {
    for (const product of readTruth(name).products) {
      const prefix = product.categoryPrefix;
      const matches = TAXONOMY.some((path) => path === prefix || path.startsWith(`${prefix} > `));
      expect(matches, `${product.productKey}: "${prefix}"`).toBe(true);
    }
  });

  it("EC-C3: duplicateRows in messy-120 are exact copies of their originals", () => {
    const rows = parseCsv("messy-120.csv").slice(1);
    const truth = readTruth("messy-120");
    expect(truth.duplicateRows.length).toBeGreaterThan(0);
    for (const { row, of } of truth.duplicateRows) expect(rows[row - 1]).toEqual(rows[of - 1]);
  });

  it("EC-B15: messy-120 ground truth carries at least one negated claim", () => {
    const truth = readTruth("messy-120");
    expect(truth.products.some((p) => p.negatedClaims.length > 0)).toBe(true);
    expect(truth.products.some((p) => p.expectedReviewReasons.includes("no_price"))).toBe(true);
    expect(truth.products.some((p) => p.expectedReviewReasons.includes("sku_conflict"))).toBe(true);
    expect(truth.products.some((p) => p.language === "de")).toBe(true);
  });

  it("EC-C4: both bulk files contain a conflicting-SKU pair and exact duplicates", () => {
    for (const name of ["bulk-1000", "bulk-10000"]) {
      const truth = readTruth(name);
      expect(truth.duplicateRows.length).toBeGreaterThan(0);
      expect(truth.products.some((p) => p.expectedReviewReasons.includes("sku_conflict"))).toBe(true);
    }
  });

  it("photos-messy.zip contains broken.jpg and logo.svg", async () => {
    const names = await zipEntries(join(dir, "photos-messy.zip"));
    expect(names).toContain("broken.jpg");
    expect(names).toContain("logo.svg");
    expect(names).toContain("subfolder/TC-MG-01.jpg");
    const truth = readTruth("messy-120");
    const referenced = new Set([...truth.products.flatMap((p) => p.photos), ...truth.unmatchedPhotos]);
    expect([...referenced].sort()).toEqual([...names].sort());
  });

  it("is deterministic: a second run with the same seed produces identical CSV and JSON", async () => {
    const again = mkdtempSync(join(tmpdir(), "catalogforge-samples-again-"));
    try {
      const files = await generateSamples({ outDir: again, seed: SEED });
      for (const f of files) {
        if (!/\.(csv|json|zip|xlsx)$/.test(f.name)) continue;
        expect(sha256(join(again, f.name)), f.name).toBe(sha256(join(dir, f.name)));
      }
    } finally {
      rmSync(again, { recursive: true, force: true });
    }
  }, 120_000);
});
