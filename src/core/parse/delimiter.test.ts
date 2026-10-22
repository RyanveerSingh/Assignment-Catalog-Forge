import { describe, expect, it } from "vitest";
import { detectDelimiter } from "./delimiter";

describe("detectDelimiter (EC-A5)", () => {
  const cases: Array<[string, string, "," | ";" | "\t" | "|"]> = [
    ["EC-A5: comma", "sku,name,price\nA1,Vase,12.50\nA2,Bowl,8.00\n", ","],
    ["EC-A5: semicolon (European Excel export with decimal commas)", "sku;name;price\nA1;Vase;12,50\nA2;Bowl;8,00\n", ";"],
    ["EC-A5: tab", "sku\tname\tprice\nA1\tVase\t12.50\nA2\tBowl\t8.00\n", "\t"],
    ["EC-A5: pipe", "sku|name|price\nA1|Vase|12.50\nA2|Bowl|8.00\n", "|"],
    ["EC-A5: semicolon wins when commas appear inconsistently inside values", 'sku;name;price\nA1;"Vase, blue, large";12,50\nA2;Bowl;8\nA3;Pot, tall;15,00\n', ";"],
    ["EC-A5: tab wins over an equally consistent comma because it yields more columns", "sku\tname\tprice\nA1\tVase, blue\t12.50\nA2\tBowl, red\t8.00\n", "\t"],
    ["EC-A6: delimiters inside double quotes do not count", 'sku,name\nA1,"a;b;c;d;e"\nA2,"x;y;z;w;v"\nA3,"p;q;r;s;t"\n', ","],
    ["EC-A6: a quoted field spanning lines stays one record", 'sku,name,price\nA1,"Blue vase\nwith lid, large",12.50\nA2,Bowl,8.00\n', ","],
    ["CRLF line endings", "sku;name\r\nA1;Vase\r\nA2;Bowl\r\n", ";"],
    ["lone CR line endings", "sku;name\rA1;Vase\rA2;Bowl\r", ";"],
    ["blank lines are ignored", "sku,name\n\n\nA1,Vase\n\nA2,Bowl\n", ","],
    ["single header line only", "sku;name;price", ";"],
    ["tie on consistency and column count goes to comma", "a,b;c\nd,e;f\ng,h;i\n", ","],
    ["tie between semicolon and tab goes to semicolon", "a;b\tc\nd;e\tf\n", ";"],
    ["only the first 50 records are sampled", `${"a;b;c\n".repeat(50)}${"x,y,z,w\n".repeat(200)}`, ";"],
  ];

  it.each(cases)("%s", (_name, sample, delimiter) => {
    const result = detectDelimiter(sample);
    expect(result.delimiter).toBe(delimiter);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });

  it("perfectly consistent files get full confidence", () => {
    expect(detectDelimiter("a;b;c\n1;2;3\n4;5;6\n").confidence).toBe(100);
  });

  it("inconsistent counts lower the confidence", () => {
    const result = detectDelimiter("a,b,c\n1,2\n4,5,6\n7,8,9,10\n");
    expect(result.delimiter).toBe(",");
    expect(result.confidence).toBeLessThan(100);
  });

  it.each([
    ["empty string", ""],
    ["whitespace only", "   \n\t\n"],
    ["single column with no delimiter at all", "sku\nA1\nA2\n"],
  ])("falls back to comma with zero confidence: %s", (_name, sample) => {
    expect(detectDelimiter(sample)).toEqual({ delimiter: ",", confidence: 0 });
  });
});
