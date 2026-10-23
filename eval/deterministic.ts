/**
 * The deterministic half of the eval: load a sample sheet with its ground truth, then run
 * parse → map → clean → group exactly as the jobs do it.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { buildCleanRowContext, cleanRow } from "@/core/clean/row";
import { groupRows } from "@/core/group/group";
import { mapColumns } from "@/core/parse/headers";
import { parseSheet } from "@/core/parse/sheet";
import type { DuplicateRow, GroundTruthFile, ProductGroup } from "@/core/types";
import { getConfig } from "@/lib/config";

const MAPPING_SAMPLE_ROWS = 50;
const SAMPLES_DIR = path.join(process.cwd(), "samples");
export const DEFAULT_CURRENCY = "EUR";

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function isGroundTruthFile(value: unknown): value is GroundTruthFile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.products) && Array.isArray(v.duplicateRows);
}

export function loadSample(sample: string): { file: string; buffer: Buffer; truth: GroundTruthFile } {
  const file = [path.join(SAMPLES_DIR, `${sample}.csv`), path.join(SAMPLES_DIR, `${sample}.xlsx`)].find((p) => existsSync(p));
  if (!file) throw new Error(`no samples/${sample}.csv or samples/${sample}.xlsx`);
  const truthPath = path.join(SAMPLES_DIR, "ground-truth", `${sample}.json`);
  if (!existsSync(truthPath)) throw new Error(`no ground truth at samples/ground-truth/${sample}.json`);
  const parsed: unknown = JSON.parse(readFileSync(truthPath, "utf8"));
  if (!isGroundTruthFile(parsed)) throw new Error(`${truthPath} is not a GroundTruthFile`);
  return { file, buffer: readFileSync(file), truth: parsed };
}

// ---------------------------------------------------------------------------
// Deterministic stages (parse → map → clean → group), exactly as the jobs do it
// ---------------------------------------------------------------------------

export interface Deterministic {
  rows: number;
  groups: ProductGroup[];
  duplicates: DuplicateRow[];
  keptRows: Set<number>;
  cellsByRow: Map<number, Record<string, string>>;
}

export function runDeterministic(buffer: Buffer, file: string, limit: number | null): Deterministic {
  const sheet = parseSheet(buffer, { filename: path.basename(file), maxRows: getConfig().MAX_ROWS_PER_IMPORT });
  if (sheet.rows.length === 0) throw new Error(`no rows parsed from ${file}: ${sheet.issues.map((i) => i.message).join("; ") || "empty sheet"}`);
  const sampleRows = sheet.rows.slice(0, MAPPING_SAMPLE_ROWS).map((r) => sheet.headers.map((h) => r.cells[h] ?? ""));
  const mappings = mapColumns(sheet.originalHeaders, sampleRows);
  const ctx = buildCleanRowContext(sheet, mappings, DEFAULT_CURRENCY);
  const grouped = groupRows(
    sheet.rows.map((r) => cleanRow(r, ctx)),
    { storeDefaultCurrency: DEFAULT_CURRENCY },
  );

  // Sheet order, so --limit N means "the first N products a merchant would see".
  let groups = [...grouped.groups].sort((a, b) => (a.sourceRows[0] ?? 0) - (b.sourceRows[0] ?? 0));
  if (limit !== null) groups = groups.slice(0, limit);
  const keptRows = new Set(groups.flatMap((g) => g.sourceRows));
  const duplicates = grouped.duplicateRows.filter((d) => keptRows.has(d.of));
  for (const d of duplicates) keptRows.add(d.row);
  return { rows: sheet.rows.length, groups, duplicates, keptRows, cellsByRow: new Map(sheet.rows.map((r) => [r.rowNumber, r.cells])) };
}
