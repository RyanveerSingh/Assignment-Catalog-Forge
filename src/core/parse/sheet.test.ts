import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import type { Issue } from "../types";
import { parseSheet } from "./sheet";

function csv(text: string): Buffer {
  return Buffer.from(text, "utf8");
}

function workbook(sheets: Array<{ name: string; rows: unknown[][] }>, bookType: "xlsx" | "xls" = "xlsx"): Buffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  const out: unknown = XLSX.write(wb, { type: "buffer", bookType });
  if (!Buffer.isBuffer(out)) throw new Error("XLSX.write did not return a Buffer");
  return out;
}

function codes(issues: Issue[]): string[] {
  return issues.map((i) => i.code);
}

function find(issues: Issue[], code: string): Issue | undefined {
  return issues.find((i) => i.code === code);
}

const SIMPLE = "sku,name,price\nA1,Vase,12.50\nA2,Bowl,8.00\n";

describe("parseSheet: unsupported input (EC-A1, EC-A2)", () => {
  it("EC-A1: an empty file yields zero rows and 'File is empty'", () => {
    const sheet = parseSheet(Buffer.alloc(0), { filename: "empty.csv", maxRows: 100 });
    expect(sheet.rows).toEqual([]);
    expect(sheet.totalRows).toBe(0);
    const problem = find(sheet.issues, "sheet.unsupported_type");
    expect(problem).toMatchObject({ severity: "error", message: "File is empty.", ec: "A1" });
  });

  const wrong: Array<[string, Buffer, string, RegExp]> = [
    ["EC-A2: a .csv that is really HTML", Buffer.from("<html><table><tr><td>sku</td></tr></table></html>"), "export.csv", /HTML/],
    ["EC-A2: a PDF", Buffer.from("%PDF-1.4\n"), "catalog.pdf", /PDF/],
    ["EC-A2: a ZIP of photos", Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("photos/a.jpg")]), "photos.zip", /ZIP/],
    ["EC-A2: a PNG renamed to .xlsx", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "sheet.xlsx", /image \(png\)/],
    ["EC-A2: random binary", Buffer.from(Array.from({ length: 512 }, (_, i) => i % 256)), "data.csv", /binary/],
  ];

  it.each(wrong)("%s is rejected with the detected type named", (_name, buf, filename, pattern) => {
    const sheet = parseSheet(buf, { filename, maxRows: 100 });
    expect(sheet.rows).toEqual([]);
    expect(sheet.headers).toEqual([]);
    const problem = find(sheet.issues, "sheet.unsupported_type");
    expect(problem?.severity).toBe("error");
    expect(problem?.message).toMatch(pattern);
  });

  it("EC-A2: a .csv that is really XLSX is parsed as XLSX and the mismatch is reported", () => {
    const buf = workbook([{ name: "Sheet1", rows: [["sku", "name"], ["A1", "Vase"]] }]);
    const sheet = parseSheet(buf, { filename: "export.csv", maxRows: 100 });
    expect(sheet.format).toBe("xlsx");
    expect(sheet.rows).toHaveLength(1);
    expect(find(sheet.issues, "sheet.extension_mismatch")).toMatchObject({ severity: "warn", ec: "A2" });
  });

  it("never throws on a corrupt workbook", () => {
    const buf = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("xl/workbook.xml"), Buffer.from(Array.from({ length: 300 }, (_, i) => (i * 13) % 256))]);
    const sheet = parseSheet(buf, { filename: "broken.xlsx", maxRows: 100 });
    expect(sheet.rows).toEqual([]);
    expect(sheet.issues.some((i) => i.severity === "error")).toBe(true);
  });

  it("never throws on an unterminated quote", () => {
    const sheet = parseSheet(csv('sku,name\nA1,"Vase\nA2,Bowl\n'), { maxRows: 100 });
    expect(Array.isArray(sheet.rows)).toBe(true);
  });
});

describe("parseSheet: CSV", () => {
  it("parses a simple comma file with 1-based row numbers", () => {
    const sheet = parseSheet(csv(SIMPLE), { filename: "simple.csv", maxRows: 100 });
    expect(sheet.format).toBe("csv");
    expect(sheet.headers).toEqual(["sku", "name", "price"]);
    expect(sheet.originalHeaders).toEqual(["sku", "name", "price"]);
    expect(sheet.headerRowIndex).toBe(0);
    expect(sheet.delimiter).toBe(",");
    expect(sheet.encoding).toBe("utf-8");
    expect(sheet.rows).toEqual([
      { rowNumber: 1, cells: { sku: "A1", name: "Vase", price: "12.50" } },
      { rowNumber: 2, cells: { sku: "A2", name: "Bowl", price: "8.00" } },
    ]);
    expect(sheet.totalRows).toBe(2);
    expect(sheet.truncated).toBe(false);
    expect(sheet.issues).toEqual([]);
  });

  it("EC-A4: windows-1252 bytes are decoded", () => {
    const buf = iconv.encode("Artikel;Größe;Preis\nA1;Übertopf „groß“;12,50 €\n", "windows1252");
    const sheet = parseSheet(buf, { maxRows: 100 });
    expect(sheet.encoding).toBe("windows-1252");
    expect(sheet.headers).toEqual(["artikel", "grosse", "preis"]);
    expect(sheet.originalHeaders[1]).toBe("Größe");
    expect(sheet.rows[0].cells).toEqual({ artikel: "A1", grosse: "Übertopf „groß“", preis: "12,50 €" });
  });

  it("EC-A4: a UTF-8 BOM does not pollute the first header", () => {
    const sheet = parseSheet(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), csv(SIMPLE)]), { maxRows: 100 });
    expect(sheet.headers[0]).toBe("sku");
    expect(sheet.originalHeaders[0]).toBe("sku");
  });

  it("EC-A4: UTF-16LE with BOM (Excel 'Unicode text') is parsed", () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("sku\tname\nA1\tÜbertopf\n", "utf16le")]);
    const sheet = parseSheet(buf, { maxRows: 100 });
    expect(sheet.encoding).toBe("utf-16le");
    expect(sheet.delimiter).toBe("\t");
    expect(sheet.rows[0].cells).toEqual({ sku: "A1", name: "Übertopf" });
  });

  it("EC-A5: a semicolon-delimited European file", () => {
    const sheet = parseSheet(csv("sku;name;price\nA1;Vase, blue;12,50\nA2;Bowl;8,00\n"), { maxRows: 100 });
    expect(sheet.delimiter).toBe(";");
    expect(sheet.headers).toEqual(["sku", "name", "price"]);
    expect(sheet.rows[0].cells).toEqual({ sku: "A1", name: "Vase, blue", price: "12,50" });
  });

  it("EC-A6: quoted fields with an embedded newline, a comma and escaped quotes", () => {
    const sheet = parseSheet(csv('sku,title,price\nA1,"Blue vase, 20 cm\nwith ""lid""",12.50\nA2,Bowl,8.00\n'), { maxRows: 100 });
    expect(sheet.rows).toHaveLength(2);
    expect(sheet.rows[0].cells.title).toBe('Blue vase, 20 cm\nwith "lid"');
    expect(sheet.rows[0].cells.price).toBe("12.50");
    expect(sheet.rows[1].cells).toEqual({ sku: "A2", title: "Bowl", price: "8.00" });
  });

  it("EC-A7: ragged rows are padded or trimmed and flagged on the row", () => {
    const sheet = parseSheet(csv("sku,name,price\nA1,Vase\nA2,Bowl,8.00,extra\nA3,Pot,15.00\n"), { maxRows: 100 });
    expect(sheet.headers).toEqual(["sku", "name", "price"]);
    expect(sheet.rows[0].cells).toEqual({ sku: "A1", name: "Vase", price: "" });
    expect(sheet.rows[1].cells).toEqual({ sku: "A2", name: "Bowl", price: "8.00" });
    expect(sheet.rows[2].cells).toEqual({ sku: "A3", name: "Pot", price: "15.00" });
    const ragged = sheet.issues.filter((i) => i.code === "row.ragged");
    expect(ragged.map((i) => i.row)).toEqual([1, 2]);
    expect(ragged[1].value).toBe("extra");
    expect(ragged.every((i) => i.severity === "info" && i.ec === "A7")).toBe(true);
  });

  it("EC-A7: when most rows are wider than the header the extra column is kept under a generated name", () => {
    const sheet = parseSheet(csv("sku,name\nA1,Vase,red\nA2,Bowl,blue\nA3,Pot,green\n"), { maxRows: 100 });
    expect(sheet.headers).toEqual(["sku", "name", "column_3"]);
    expect(sheet.rows[0].cells.column_3).toBe("red");
    expect(codes(sheet.issues)).not.toContain("row.ragged");
  });

  it("EC-A8: title rows above the header are skipped and the header index is reported", () => {
    const sheet = parseSheet(csv("Price list 2024\n\nsku,name,price\nA1,Vase,12.50\n"), { maxRows: 100 });
    expect(sheet.headerRowIndex).toBe(1);
    expect(sheet.headers).toEqual(["sku", "name", "price"]);
    expect(sheet.rows).toEqual([{ rowNumber: 1, cells: { sku: "A1", name: "Vase", price: "12.50" } }]);
  });

  it("EC-A9: no header row fails fast with a sample of the first rows", () => {
    const sheet = parseSheet(csv("A1,Vase,12.50\nA2,Bowl,8.00\nA3,Pot,15.00\n"), { maxRows: 100 });
    expect(sheet.rows).toEqual([]);
    expect(sheet.headers).toEqual([]);
    expect(sheet.headerRowIndex).toBe(-1);
    const problem = find(sheet.issues, "sheet.no_header");
    expect(problem).toMatchObject({ severity: "error", ec: "A9" });
    expect(problem?.value).toContain("A1 | Vase | 12.50");
  });

  it("EC-A10: duplicate Price headers are suffixed", () => {
    const sheet = parseSheet(csv("sku,Price,Price\nA1,12.50,15.00\n"), { maxRows: 100 });
    expect(sheet.headers).toEqual(["sku", "price", "price_2"]);
    expect(sheet.originalHeaders).toEqual(["sku", "Price", "Price"]);
    expect(sheet.rows[0].cells).toEqual({ sku: "A1", price: "12.50", price_2: "15.00" });
  });

  it("EC-A13: scientific notation is flagged in any column", () => {
    const sheet = parseSheet(csv("sku,name\n1.2E+05,Vase\nA2,Bowl\n"), { maxRows: 100 });
    expect(sheet.rows[0].cells.sku).toBe("1.2E+05");
    expect(find(sheet.issues, "cell.scientific_notation")).toMatchObject({ severity: "warn", field: "sku", row: 1, value: "1.2E+05", ec: "A13" });
  });

  it("EC-A13: a date-like value is flagged in SKU, title and barcode columns but not in a date column", () => {
    const sheet = parseSheet(csv("sku,name,ean,available from\n01/02/2024,Vase,12.03.2024,01/02/2024\n"), { maxRows: 100 });
    const flagged = sheet.issues.filter((i) => i.code === "cell.date_like").map((i) => i.field);
    expect(flagged).toEqual(["sku", "ean"]);
  });

  it("EC-A14: rows beyond maxRows are counted but not imported", () => {
    const lines = ["sku,name,price"];
    for (let i = 1; i <= 10_500; i++) lines.push(`SKU-${i},Item ${i},${i}.00`);
    const sheet = parseSheet(csv(lines.join("\n")), { maxRows: 10_000 });
    expect(sheet.rows).toHaveLength(10_000);
    expect(sheet.rows[9_999]).toMatchObject({ rowNumber: 10_000, cells: { sku: "SKU-10000" } });
    expect(sheet.totalRows).toBe(10_500);
    expect(sheet.truncated).toBe(true);
    expect(find(sheet.issues, "sheet.truncated")).toMatchObject({ severity: "warn", message: "Rows 10001 and beyond were not imported", ec: "A14" });
  });

  it("EC-A14: a sheet within the cap is not truncated", () => {
    const sheet = parseSheet(csv(SIMPLE), { maxRows: 2 });
    expect(sheet.truncated).toBe(false);
    expect(codes(sheet.issues)).not.toContain("sheet.truncated");
  });

  it("EC-A15: a 50 KB cell is kept in full and flagged once per row", () => {
    const long = "x".repeat(50_000);
    const sheet = parseSheet(csv(`sku,description,notes\nA1,${long},${long}\nA2,short,short\n`), { maxRows: 100 });
    expect(sheet.rows[0].cells.description).toHaveLength(50_000);
    const flagged = sheet.issues.filter((i) => i.code === "cell.very_long");
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatchObject({ severity: "info", row: 1, field: "description", ec: "A15" });
  });

  it("EC-A16: a header-only sheet completes with zero rows and a clear message", () => {
    const sheet = parseSheet(csv("sku,name,price\n"), { maxRows: 100 });
    expect(sheet.headers).toEqual(["sku", "name", "price"]);
    expect(sheet.rows).toEqual([]);
    expect(sheet.totalRows).toBe(0);
    expect(sheet.truncated).toBe(false);
    expect(find(sheet.issues, "sheet.no_data_rows")).toMatchObject({ severity: "info", ec: "A16" });
    expect(codes(sheet.issues)).not.toContain("sheet.no_header");
  });

  it("blank and whitespace-only lines are skipped", () => {
    const sheet = parseSheet(csv("sku,name\n\nA1,Vase\n , \nA2,Bowl\n\n\n"), { maxRows: 100 });
    expect(sheet.rows.map((r) => r.cells.sku)).toEqual(["A1", "A2"]);
    expect(sheet.totalRows).toBe(2);
  });

  it("maxRows of 0 keeps nothing but still counts", () => {
    const sheet = parseSheet(csv(SIMPLE), { maxRows: 0 });
    expect(sheet.rows).toEqual([]);
    expect(sheet.totalRows).toBe(2);
    expect(sheet.truncated).toBe(true);
  });
});

describe("parseSheet: XLSX / XLS", () => {
  it("EC-A8 / EC-A12: two title rows above the header and a second empty sheet", () => {
    const buf = workbook([
      { name: "Preise", rows: [["Preisliste 2024"], ["Stand: März"], [], ["Artikelnummer", "Bezeichnung", "Preis"], ["TC-01", "Übertopf", "12,50"], ["TC-02", "Schale", "8,00"]] },
      { name: "Leer", rows: [] },
    ]);
    const sheet = parseSheet(buf, { filename: "preise.xlsx", maxRows: 100 });
    expect(sheet.format).toBe("xlsx");
    expect(sheet.sheetName).toBe("Preise");
    expect(sheet.headerRowIndex).toBe(2);
    expect(sheet.headers).toEqual(["artikelnummer", "bezeichnung", "preis"]);
    expect(sheet.originalHeaders).toEqual(["Artikelnummer", "Bezeichnung", "Preis"]);
    expect(sheet.rows).toEqual([
      { rowNumber: 1, cells: { artikelnummer: "TC-01", bezeichnung: "Übertopf", preis: "12,50" } },
      { rowNumber: 2, cells: { artikelnummer: "TC-02", bezeichnung: "Schale", preis: "8,00" } },
    ]);
    expect(find(sheet.issues, "sheet.selected")).toMatchObject({ severity: "info", value: "Preise", ec: "A12" });
    expect(codes(sheet.issues)).not.toContain("row.ragged");
  });

  it("EC-A12: the first sheet with data is used when the first sheet is empty", () => {
    const buf = workbook([
      { name: "Cover", rows: [] },
      { name: "Data", rows: [["sku", "name"], ["A1", "Vase"]] },
    ]);
    const sheet = parseSheet(buf, { maxRows: 100 });
    expect(sheet.sheetName).toBe("Data");
    expect(sheet.rows).toHaveLength(1);
    expect(find(sheet.issues, "sheet.selected")?.message).toContain('"Data"');
  });

  it("EC-A12: a single-sheet workbook does not report a selection", () => {
    const sheet = parseSheet(workbook([{ name: "Only", rows: [["sku"], ["A1"]] }]), { maxRows: 100 });
    expect(sheet.sheetName).toBe("Only");
    expect(codes(sheet.issues)).not.toContain("sheet.selected");
  });

  it("EC-A13: cells are read as formatted text, leading zeros survive and Excel accidents are flagged", () => {
    const buf = workbook([{ name: "S", rows: [["SKU", "Name", "Qty"], ["00123", "Vase", 123], ["01/02/2024", "Bowl", "1E5"]] }]);
    const sheet = parseSheet(buf, { maxRows: 100 });
    expect(sheet.rows[0].cells).toEqual({ sku: "00123", name: "Vase", qty: "123" });
    expect(sheet.rows[1].cells.sku).toBe("01/02/2024");
    expect(find(sheet.issues, "cell.date_like")).toMatchObject({ field: "sku", row: 2 });
    expect(find(sheet.issues, "cell.scientific_notation")).toMatchObject({ field: "qty", row: 2, value: "1E5" });
  });

  it("EC-A16: a workbook whose sheets are all empty reports no header rather than hanging", () => {
    const sheet = parseSheet(workbook([{ name: "Empty", rows: [] }]), { maxRows: 100 });
    expect(sheet.rows).toEqual([]);
    expect(find(sheet.issues, "sheet.no_header")?.severity).toBe("error");
  });

  it("EC-A14: truncation applies to workbooks too", () => {
    const rows: unknown[][] = [["sku", "name"]];
    for (let i = 1; i <= 25; i++) rows.push([`S${i}`, `Item ${i}`]);
    const sheet = parseSheet(workbook([{ name: "S", rows }]), { maxRows: 20 });
    expect(sheet.rows).toHaveLength(20);
    expect(sheet.totalRows).toBe(25);
    expect(find(sheet.issues, "sheet.truncated")?.message).toBe("Rows 21 and beyond were not imported");
  });

  it("legacy XLS (BIFF8) is parsed with format 'xls'", () => {
    const buf = workbook([{ name: "Sheet1", rows: [["sku", "name", "price"], ["A1", "Vase", "12.50"]] }], "xls");
    const sheet = parseSheet(buf, { filename: "old.xls", maxRows: 100 });
    expect(sheet.format).toBe("xls");
    expect(sheet.headers).toEqual(["sku", "name", "price"]);
    expect(sheet.rows[0].cells).toEqual({ sku: "A1", name: "Vase", price: "12.50" });
    expect(codes(sheet.issues)).not.toContain("sheet.extension_mismatch");
  });
});
