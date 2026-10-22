import { describe, expect, it } from "vitest";
import type { CleanedRow } from "../types";
import { deriveSkuStem, syntheticSku, titleKey } from "./key";

describe("deriveSkuStem", () => {
  it.each([
    ["TC-PL-20", "TC-PL"],
    ["TC-PL-20-BLUE", "TC-PL"],
    ["TC_PL_30", "TC_PL"],
    ["MUG-RED", "MUG"],
    ["SKU-1", "SKU"],
    ["TC-PL-XL", "TC-PL"],
    ["TC-PL-20CM", "TC-PL"],
    ["TC/PL/20", "TC/PL"],
    ["TC.PL.20", "TC.PL"],
    ["TC PL 20", "TC PL"],
    ["tc-pl-20", "tc-pl"],
    ["MUG-DUNKELBLAU", "MUG"],
    ["ABC-DEF-GH", "ABC-DEF"],
    ["-TC-PL-20-", "TC-PL"],
  ])("EC-C1: %j -> %j", (sku, expected) => {
    expect(deriveSkuStem(sku)).toBe(expected);
  });

  it.each([
    ["ABC123", "no separator, nothing to drop"],
    ["TC-PL", "a two-letter tail with only one segment before it"],
    ["RED", "a lone colour word leaves nothing"],
    ["20", "a lone number leaves nothing"],
    ["", "empty"],
    ["---", "separators only"],
  ])("%j has no stem (%s)", (sku) => {
    expect(deriveSkuStem(sku)).toBeNull();
  });

  it("drops exact colour words but not fuzzy look-alikes such as TEAK", () => {
    expect(deriveSkuStem("TEAK-1")).toBe("TEAK");
    expect(deriveSkuStem("TEAK-OAK")).toBe("TEAK");
  });

  it("never throws on non-string input", () => {
    expect(deriveSkuStem(undefined as unknown as string)).toBeNull();
    expect(deriveSkuStem(42 as unknown as string)).toBeNull();
  });
});

describe("titleKey", () => {
  it.each([
    ["Terracotta Planter 20cm Blue", "terracotta planter"],
    ["Terracotta Planter 30 cm", "terracotta planter"],
    ["TERRACOTTA  PLANTER!", "terracotta planter"],
    ["Töpfe Größe 20", "topfe"],
  ])("EC-C5: %j -> %j", (title, expected) => {
    expect(titleKey(title)).toBe(expected);
  });

  it("returns an empty key for non-strings", () => {
    expect(titleKey(null as unknown as string)).toBe("");
  });
});

describe("syntheticSku", () => {
  const row = { rowHash: "abc" } as CleanedRow;

  it("EC-C6: is GEN- plus eight upper-case hex characters", () => {
    expect(syntheticSku(row)).toMatch(/^GEN-[0-9A-F]{8}$/);
  });

  it("EC-C10: depends only on the row hash", () => {
    expect(syntheticSku(row)).toBe(syntheticSku({ rowHash: "abc", rowNumber: 99 } as CleanedRow));
    expect(syntheticSku(row)).not.toBe(syntheticSku({ rowHash: "abd" } as CleanedRow));
  });

  it("does not throw when the hash is missing", () => {
    expect(syntheticSku({} as CleanedRow)).toMatch(/^GEN-[0-9A-F]{8}$/);
  });
});
