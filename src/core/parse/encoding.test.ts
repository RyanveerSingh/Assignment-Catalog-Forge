import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import { decodeText } from "./encoding";

const GERMAN = "Artikelnummer;Bezeichnung;Größe;Preis\nTC-01;Übertopf „Terra“ – groß;20 cm;12,50 €\nTC-02;Schale für die Küche;15 cm;8,00 €\n";
/** Latin-1 cannot encode €, so this sample stays inside ISO-8859-1. */
const FRENCH_LATIN1 = "Référence;Désignation;Matière;Prix\nRF-01;Cache-pot émaillé;Grès;24,90\nRF-02;Soucoupe à réserve d'eau;Terre cuite;6,50\n";
const ASCII = "sku,name,price\nA1,Vase,12.50\n";

function utf16be(text: string): Buffer {
  return Buffer.from(Buffer.from(text, "utf16le")).swap16();
}

describe("decodeText (EC-A4)", () => {
  const cases: Array<[string, Buffer, string, string | string[], boolean]> = [
    ["EC-A4: UTF-8 with BOM", Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(GERMAN, "utf8")]), GERMAN, "utf-8", true],
    ["EC-A4: UTF-16LE with BOM (Excel 'Unicode text')", Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(GERMAN, "utf16le")]), GERMAN, "utf-16le", true],
    ["EC-A4: UTF-16BE with BOM", Buffer.concat([Buffer.from([0xfe, 0xff]), utf16be(GERMAN)]), GERMAN, "utf-16be", true],
    ["EC-A4: UTF-8 without BOM", Buffer.from(GERMAN, "utf8"), GERMAN, "utf-8", false],
    ["EC-A4: windows-1252 (Excel on Windows, with € „ “ – in the 0x80–0x9F range)", iconv.encode(GERMAN, "windows1252"), GERMAN, "windows-1252", false],
    ["EC-A4: ISO-8859-1 / Latin-1", iconv.encode(FRENCH_LATIN1, "latin1"), FRENCH_LATIN1, ["windows-1252", "iso-8859-15"], false],
    ["EC-A4: UTF-16LE without BOM", Buffer.from(GERMAN, "utf16le"), GERMAN, "utf-16le", false],
    ["EC-A4: UTF-16BE without BOM", utf16be(GERMAN), GERMAN, "utf-16be", false],
    ["plain ASCII is reported as UTF-8", Buffer.from(ASCII, "ascii"), ASCII, "utf-8", false],
    ["empty buffer", Buffer.alloc(0), "", "utf-8", false],
  ];

  it.each(cases)("%s", (_name, buf, text, encoding, hadBom) => {
    const result = decodeText(buf);
    expect(result.text).toBe(text);
    if (Array.isArray(encoding)) expect(encoding).toContain(result.encoding);
    else expect(result.encoding).toBe(encoding);
    expect(result.hadBom).toBe(hadBom);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
    expect(result.text.includes("�")).toBe(false);
  });

  it("EC-A4: a BOM never leaks into the text", () => {
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("sku,name\n")]);
    expect(decodeText(withBom).text.charCodeAt(0)).not.toBe(0xfeff);
    expect(decodeText(withBom).text.startsWith("sku")).toBe(true);
  });

  it("EC-A4: BOM and strict UTF-8 give full confidence", () => {
    expect(decodeText(Buffer.from(GERMAN, "utf8")).confidence).toBe(100);
    expect(decodeText(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(ASCII, "utf16le")])).confidence).toBe(100);
  });

  it("EC-A4: never returns U+FFFD for the five bytes windows-1252 leaves undefined", () => {
    const buf = Buffer.concat([Buffer.from("A"), Buffer.from([0x81, 0x8d, 0x8f, 0x90, 0x9d]), Buffer.from("B\n")]);
    const result = decodeText(buf);
    expect(result.text.includes("�")).toBe(false);
    expect(result.text.length).toBe(buf.length);
    expect(result.text.startsWith("A")).toBe(true);
    expect(result.text.endsWith("B\n")).toBe(true);
  });

  it("EC-A4: mostly-UTF-8 bytes with a stray Latin-1 byte fall back to a single-byte decode rather than U+FFFD", () => {
    const buf = Buffer.concat([Buffer.from("sku;name\nA1;Vase gro", "utf8"), Buffer.from([0xdf]), Buffer.from("\n", "utf8")]);
    const result = decodeText(buf);
    expect(result.text.includes("�")).toBe(false);
    expect(result.encoding).toBe("windows-1252");
    expect(result.text.endsWith("groß\n")).toBe(true);
  });

  it("EC-A4: a UTF-8 BOM on non-UTF-8 bytes is treated as noise", () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), iconv.encode("Größe\n", "windows1252")]);
    const result = decodeText(buf);
    expect(result.text).toBe("Größe\n");
    expect(result.hadBom).toBe(true);
    expect(result.encoding).toBe("windows-1252");
  });

  it("EC-A4: a large windows-1252 file is decoded in full, not just the detection sample", () => {
    const line = "TC-0001;Übertopf „Terra“;12,50 €\n";
    const text = line.repeat(40_000);
    const result = decodeText(iconv.encode(text, "windows1252"));
    expect(result.text.length).toBe(text.length);
    expect(result.text.endsWith(line)).toBe(true);
  });
});
