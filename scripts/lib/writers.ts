/**
 * Serialisers for the sample generator: CSV (papaparse), XLSX (SheetJS) and key-sorted JSON.
 * All output is a pure function of its input so re-running the generator is byte-identical.
 */

import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { GroundTruthFile } from "../../src/core/types";

export const BOM = "﻿";

export interface CsvOptions {
  delimiter?: string;
  /** Prefix a UTF-8 BOM (EC-A4). */
  bom?: boolean;
}

/** Header (optional) + data rows → CSV text with LF line endings and a trailing newline. */
export function toCsv(header: string[] | null, data: string[][], opts: CsvOptions = {}): string {
  const delimiter = opts.delimiter ?? ",";
  const config = { delimiter, newline: "\n", quotes: false, escapeFormulae: false };
  const parts: string[] = [];
  if (header) parts.push(Papa.unparse([header], config));
  if (data.length > 0) parts.push(Papa.unparse(data, config));
  const body = parts.join("\n");
  return `${opts.bom ? BOM : ""}${body}${body.endsWith("\n") ? "" : "\n"}`;
}

const FIXED_DATE = new Date("2026-10-01T00:00:00Z");

/**
 * Workbook with `preamble` rows above the header on the first sheet (EC-A8) plus an empty
 * second sheet named "Notes" (EC-A12). Dates are pinned so the bytes are reproducible.
 */
export function toXlsx(preamble: string[][], header: string[], data: string[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([...preamble, header, ...data]);
  XLSX.utils.book_append_sheet(wb, sheet, "Products");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), "Notes");
  wb.Props = {
    Title: "Supplier price list",
    Author: "CatalogForge sample generator",
    CreatedDate: FIXED_DATE,
    ModifiedDate: FIXED_DATE,
  };
  const out: unknown = XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true });
  if (!Buffer.isBuffer(out)) throw new Error("XLSX.write did not return a Buffer");
  return out;
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function isPlainObject(v: unknown): v is { [key: string]: Json } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** JSON.stringify with object keys sorted at every level. `indent` 0 = single line. */
export function stableStringify(value: unknown, indent = 2): string {
  const sortKeys = (v: unknown): Json => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (isPlainObject(v)) {
      const out: { [key: string]: Json } = {};
      for (const key of Object.keys(v).sort()) out[key] = sortKeys(v[key]);
      return out;
    }
    if (v === undefined) return null;
    return v as Json;
  };
  return JSON.stringify(sortKeys(value), null, indent > 0 ? indent : undefined);
}

/**
 * Ground truth JSON. Small files are fully indented; bulk files keep one product per line so
 * diffs stay readable without tripling the file size.
 */
export function groundTruthJson(gt: GroundTruthFile, compactProducts: boolean): string {
  if (!compactProducts) return `${stableStringify(gt, 2)}\n`;
  const { products, ...rest } = gt;
  const head = stableStringify({ ...rest, products: [] }, 2);
  const lines = products.map((p) => `    ${stableStringify(p, 0)}`).join(",\n");
  return `${head.replace('"products": []', `"products": [\n${lines}\n  ]`)}\n`;
}
