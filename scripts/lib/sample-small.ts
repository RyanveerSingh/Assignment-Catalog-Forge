/**
 * The small samples: tiny-10 (clean), semicolon-eu (German headers, ';' and EU numbers),
 * broken-latin1 (rows for the windows-1252 file), the no-header rows and the fake HTML "CSV".
 */

import type { GroundTruthFile } from "../../src/core/types";
import { templateByStem } from "./catalog";
import * as mess from "./mess";
import { buildGroundTruth, ENGLISH_COLUMNS, expandProduct, productRows, type Column, type Row } from "./rows";

export interface SmallBuild {
  rows: Row[];
  columns: Column[];
  groundTruth: GroundTruthFile;
}

/** 10 clean rows, 4 products, explicit Parent SKU on the multi-variant ones. */
export function buildTiny(seed: number): SmallBuild {
  const rows = ["TC-PL", "TC-MG", "CI-SK", "DN-PL"].flatMap((stem) => productRows(expandProduct(templateByStem(stem))));
  if (rows.length !== 10) throw new Error(`tiny-10: built ${rows.length} rows`);
  return { rows, columns: ENGLISH_COLUMNS, groundTruth: buildGroundTruth({ sample: "tiny-10", seed, rows, includeClaims: true }) };
}

export const SEMICOLON_COLUMNS: Column[] = [
  { header: "Artikelnummer", field: "sku" },
  { header: "Bezeichnung", field: "title" },
  { header: "Beschreibung", field: "description" },
  { header: "Kategorie", field: "category" },
  { header: "Preis", field: "price" },
  { header: "Währung", field: "currency" },
  { header: "Größe", field: "size" },
  { header: "Farbe", field: "colour" },
  { header: "Gewicht", field: "weight" },
];

/** Header line as the supplier's Excel wrote it: a space after every semicolon (EC-A11). */
export const SEMICOLON_HEADER_LINE = SEMICOLON_COLUMNS.map((c) => c.header).join("; ");

/** 30 German rows; no parent column, so grouping must come from the SKU stem (EC-C1). */
export function buildSemicolon(seed: number): SmallBuild {
  const stems = ["TC-PL", "GL-PT", "TC-MG", "SB-BW", "LN-CU", "VL-CU", "BW-CA", "OW-SP", "CI-SK", "WC-CN", "OK-ST"];
  const rows = stems.flatMap((stem) => productRows(expandProduct(templateByStem(stem), { lang: "de", parentStyle: "none" })));
  if (rows.length !== 30) throw new Error(`semicolon-eu: built ${rows.length} rows`);
  for (const row of rows) {
    const cents = row.variant.priceCents;
    row.cells.price = cents >= 100000 ? mess.priceEu(cents) : mess.priceEuPlain(cents);
    row.cells.currency = "EUR";
    row.cells.weight = row.variant.weightGrams >= 1000 ? mess.weightKgEu(row.variant.weightGrams) : mess.weightClean(row.variant.weightGrams);
    row.messes.push("EC-A5/A11/B5 German headers, ';' delimiter, EU number formats");
  }
  return { rows, columns: SEMICOLON_COLUMNS, groundTruth: buildGroundTruth({ sample: "semicolon-eu", seed, rows, includeClaims: true }) };
}

export const LATIN1_COLUMNS: Column[] = [
  { header: "Artikelnummer", field: "sku" },
  { header: "Bezeichnung", field: "title" },
  { header: "Beschreibung", field: "description" },
  { header: "Preis", field: "price" },
  { header: "Währung", field: "currency" },
  { header: "Größe", field: "size" },
  { header: "Farbe", field: "colour" },
];

/** 20 German rows with umlauts and "€" in the price cells; the caller encodes as windows-1252. */
export function buildLatin1(): { rows: Row[]; columns: Column[] } {
  const stems = ["GL-PT", "TC-MG", "RT-PD", "PT-BW", "WD-BL", "CT-TW", "LN-NB"];
  const rows = stems.flatMap((stem) => productRows(expandProduct(templateByStem(stem), { lang: "de", parentStyle: "none" })));
  if (rows.length !== 20) throw new Error(`broken-latin1: built ${rows.length} rows`);
  for (const row of rows) {
    row.cells.price = mess.priceEu(row.variant.priceCents);
    row.cells.currency = "EUR";
  }
  return { rows, columns: LATIN1_COLUMNS };
}

/** A portal login page a buyer "exported" by saving the browser tab as .csv (EC-A2). */
export const FAKE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Trade portal – session expired</title>
<style>body{font-family:sans-serif;margin:4em auto;max-width:40em;color:#222}</style>
</head>
<body>
<h1>Your session has expired</h1>
<p>The price list download could not be completed because you are no longer signed in.</p>
<form method="post" action="/login">
<label>Email <input type="email" name="email"></label>
<label>Password <input type="password" name="password"></label>
<button type="submit">Sign in and download again</button>
</form>
<p><a href="/pricelists/2026-10/export.csv">Return to downloads</a></p>
</body>
</html>
`;
