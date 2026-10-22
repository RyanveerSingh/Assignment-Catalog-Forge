import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { sniffFileType, type FileKind, type ImageFormat } from "./sniff";

function xlsxBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["sku", "price"], ["A1", "12.50"]]), "Sheet1");
  const out: unknown = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  if (!Buffer.isBuffer(out)) throw new Error("XLSX.write did not return a Buffer");
  return out;
}

function bmpBuffer(): Buffer {
  // "BM", declared size, reserved zeros, pixel-data offset, then a blank DIB header.
  return Buffer.concat([Buffer.from("BM"), Buffer.from([0x36, 0, 0, 0]), Buffer.alloc(4), Buffer.from([0x36, 0, 0, 0]), Buffer.alloc(40)]);
}

const CSV = Buffer.from("sku,name,price\nA1,Vase,12.50\nA2,Bowl,8.00\n");
const HTML = Buffer.from("<html><body><table><tr><td>sku</td></tr></table></body></html>");
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const XLSX_BYTES = xlsxBuffer();

describe("sniffFileType: magic bytes", () => {
  const cases: Array<[string, Buffer, FileKind, ImageFormat | undefined]> = [
    ["EC-A1: empty buffer", Buffer.alloc(0), "empty", undefined],
    ["EC-A2: XLSX (zip containing [Content_Types].xml)", XLSX_BYTES, "xlsx", undefined],
    ["EC-A17: plain ZIP archive", Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("photos/IMG_0001.jpg binary payload")]), "zip", undefined],
    ["EC-A17: empty ZIP archive", Buffer.from([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), "zip", undefined],
    ["EC-A2: legacy XLS compound document", Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)]), "xls", undefined],
    ["EC-A2: PDF", Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj", "latin1"), "pdf", undefined],
    ["EC-A17: PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), "image", "png"],
    ["EC-A17: JPEG", JPEG, "image", "jpeg"],
    ["EC-A17: WEBP", Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x10, 0, 0, 0]), Buffer.from("WEBPVP8 ")]), "image", "webp"],
    ["EC-A17: GIF", Buffer.from("GIF89a\x01\x00\x01\x00", "latin1"), "image", "gif"],
    ["EC-A17: HEIC", Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(16)]), "image", "heic"],
    ["EC-A17: BMP", bmpBuffer(), "image", "bmp"],
    ["EC-A17: TIFF little-endian", Buffer.from([0x49, 0x49, 0x2a, 0x00, 8, 0, 0, 0]), "image", "tiff"],
    ["EC-A17: TIFF big-endian", Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8]), "image", "tiff"],
    ["EC-A17: SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'), "image", "svg"],
    ["EC-A17: SVG with XML prolog and comment", Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<!-- logo -->\n<svg></svg>'), "image", "svg"],
    ["EC-A2: HTML with doctype", Buffer.from("<!DOCTYPE html>\n<html><body>x</body></html>"), "html", undefined],
    ["EC-A2: HTML table export with leading whitespace", Buffer.concat([Buffer.from("  \n\t"), HTML]), "html", undefined],
    ["XHTML page with an inline <svg> is html, not svg", Buffer.from('<?xml version="1.0"?><html><body><svg></svg></body></html>'), "html", undefined],
    ["ASCII CSV", CSV, "csv", undefined],
    ["EC-A4: UTF-8 BOM CSV", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("sku;name\nA1;Größe\n")]), "csv", undefined],
    ["EC-A4: UTF-16LE BOM CSV", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("sku,name\nA1,Vase\n", "utf16le")]), "csv", undefined],
    ["EC-A4: windows-1252 CSV with € and „quotes“", iconv.encode("Artikel;Größe;Preis €\nA1;20 cm;„12,50 €“\n", "windows1252"), "csv", undefined],
    ["EC-A5: tab-separated text", Buffer.from("sku\tname\nA1\tVase\n"), "csv", undefined],
    ["CSV whose first header starts with BM is not a bitmap", Buffer.from("BMW Part,Model\n123,3 Series\n"), "csv", undefined],
    ["random binary", Buffer.from(Array.from({ length: 1024 }, (_, i) => i % 256)), "unknown", undefined],
    ["binary with mostly control bytes", Buffer.from(Array.from({ length: 2048 }, (_, i) => (i * 7) % 32)), "unknown", undefined],
  ];

  it.each(cases)("%s", (_name, buf, kind, imageFormat) => {
    const result = sniffFileType(buf);
    expect(result.kind).toBe(kind);
    expect(result.imageFormat).toBe(imageFormat);
    expect(result.extensionMismatch).toBe(false);
  });

  it("reports a MIME type for every kind", () => {
    expect(sniffFileType(CSV).mime).toBe("text/csv");
    expect(sniffFileType(XLSX_BYTES).mime).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(sniffFileType(HTML).mime).toBe("text/html");
    expect(sniffFileType(JPEG).mime).toBe("image/jpeg");
    expect(sniffFileType(Buffer.alloc(0)).mime).toBe("inode/x-empty");
  });

  it("never throws on tiny or odd buffers", () => {
    for (const buf of [Buffer.from([0x50]), Buffer.from([0x50, 0x4b]), Buffer.from("BM"), Buffer.from([0xff, 0xfe]), Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("RIFF")]) {
      expect(() => sniffFileType(buf, "x.csv")).not.toThrow();
    }
  });
});

describe("sniffFileType: extension agreement (EC-A2)", () => {
  const cases: Array<[string, Buffer, string, FileKind, boolean]> = [
    ["EC-A2: .csv that is really HTML", HTML, "export.csv", "html", true],
    ["EC-A2: .csv that is really XLSX", XLSX_BYTES, "export.csv", "xlsx", true],
    ["EC-A2: .xls that is really HTML (Excel 'web page' export)", HTML, "export.xls", "html", true],
    ["EC-A2: .xlsx that is really a PDF", Buffer.from("%PDF-1.4"), "catalog.xlsx", "pdf", true],
    [".xlsx that is XLSX", XLSX_BYTES, "export.xlsx", "xlsx", false],
    [".xlsm claims xlsx", XLSX_BYTES, "macros.xlsm", "xlsx", false],
    [".txt is text", CSV, "list.txt", "csv", false],
    [".tsv is text", Buffer.from("a\tb\n1\t2\n"), "list.TSV", "csv", false],
    [".png that is really JPEG", JPEG, "photo.png", "image", true],
    [".jpg that is JPEG", JPEG, "photo.jpg", "image", false],
    [".jpeg inside a Windows path", JPEG, "C:\\photos\\IMG_0001.JPEG", "image", false],
    ["unknown extension cannot disagree", CSV, "data.dat", "csv", false],
    ["no extension cannot disagree", CSV, "README", "csv", false],
    ["dotfile has no extension", CSV, ".hidden", "csv", false],
    ["EC-A1: empty file never counts as a mismatch", Buffer.alloc(0), "empty.csv", "empty", false],
  ];

  it.each(cases)("%s", (_name, buf, filename, kind, mismatch) => {
    const result = sniffFileType(buf, filename);
    expect(result.kind).toBe(kind);
    expect(result.extensionMismatch).toBe(mismatch);
  });

  it("without a filename there is nothing to disagree with", () => {
    expect(sniffFileType(HTML).extensionMismatch).toBe(false);
  });
});
