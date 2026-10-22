import { describe, expect, it } from "vitest";
import type { Dimensions } from "../types";
import { formatCm, parseDimensions, parseLength, parseWeight } from "./units";

// Written as a code point so the invisible character stays visible in the test data.
const NBSP = String.fromCodePoint(0xa0);

interface LengthCase {
  name: string;
  raw: string | null | undefined;
  opts?: { assumeUnit?: "cm" | "mm" | "in" };
  cm: number | null;
  assumed?: boolean;
  codes?: string[];
}

const lengthCases: LengthCase[] = [
  { name: "EC-B7: '20cm' is 20 cm", raw: "20cm", cm: 20, assumed: false, codes: [] },
  { name: "EC-B7: '7.9\"' is 20.1 cm", raw: '7.9"', cm: 20.1, assumed: false },
  { name: "EC-B7: '7.9 in' is 20.1 cm", raw: "7.9 in", cm: 20.1, assumed: false },
  { name: "EC-B7: '200 mm' is 20 cm", raw: "200 mm", cm: 20, assumed: false },
  { name: "EC-B7: '0.2 m' is 20 cm", raw: "0.2 m", cm: 20, assumed: false },
  { name: "EC-B7: '20' assumes cm and flags it", raw: "20", cm: 20, assumed: true, codes: ["unit.assumed"] },
  { name: "EC-B7: '20,5 cm' takes a comma decimal", raw: "20,5 cm", cm: 20.5, assumed: false },
  { name: "EC-B7: '2 ft' is 61 cm", raw: "2 ft", cm: 61, assumed: false },
  { name: "EC-B7: '1 foot' is 30.5 cm", raw: "1 foot", cm: 30.5, assumed: false },
  { name: "EC-B7: '20 inches' is 50.8 cm", raw: "20 inches", cm: 50.8, assumed: false },
  { name: "EC-B7: '7,9″' double prime is inches", raw: "7,9″", cm: 20.1, assumed: false },
  { name: "EC-B7: '20 CM' is case-insensitive", raw: "20 CM", cm: 20, assumed: false },
  { name: "EC-B7: 'ca. 20 cm' ignores leading words", raw: "ca. 20 cm", cm: 20, assumed: false },
  { name: "EC-B7: '20 min' does not read the m of min as metres", raw: "20 min", cm: 20, assumed: true },
  { name: "EC-B7: '20' with assumeUnit mm is 2 cm", raw: "20", opts: { assumeUnit: "mm" }, cm: 2, assumed: true, codes: ["unit.assumed"] },
  { name: "EC-B7: '20' with assumeUnit in is 50.8 cm", raw: "20", opts: { assumeUnit: "in" }, cm: 50.8, assumed: true },
  { name: "EC-B8: '12 m' is kept but implausible", raw: "12 m", cm: 1200, codes: ["length.implausible"] },
  { name: "EC-B8: '0 cm' is kept but implausible", raw: "0 cm", cm: 0, codes: ["length.implausible"] },
  { name: "EC-B8: '900 cm' is inside the generic range", raw: "900 cm", cm: 900, codes: [] },
  { name: "EC-B13: empty string is null", raw: "", cm: null },
  { name: "EC-B13: '-' is null", raw: "-", cm: null },
  { name: "EC-B13: 'n/a' is null", raw: "n/a", cm: null },
  { name: "EC-B13: null is null", raw: null, cm: null },
  { name: "EC-B13: undefined is null", raw: undefined, cm: null },
  { name: "'abc' is null", raw: "abc", cm: null },
  { name: "'-20 cm' is null", raw: "-20 cm", cm: null },
  { name: "EC-B13: NBSP before the unit", raw: `20${NBSP}cm`, cm: 20, assumed: false },
];

describe("parseLength", () => {
  it.each(lengthCases)("$name", (c) => {
    const result = parseLength(c.raw, c.opts);
    if (c.cm === null) {
      expect(result).toBeNull();
      return;
    }
    expect(result).not.toBeNull();
    expect(result?.cm).toBe(c.cm);
    if (c.assumed !== undefined) expect(result?.assumed).toBe(c.assumed);
    if (c.codes !== undefined) expect(result?.issues.map((i) => i.code)).toEqual(c.codes);
  });

  it("EC-B7: unit.assumed carries ec B7 and info severity", () => {
    expect(parseLength("20")?.issues).toEqual([expect.objectContaining({ code: "unit.assumed", severity: "info", ec: "B7" })]);
  });

  it("EC-B8: length.implausible carries ec B8 and warn severity", () => {
    expect(parseLength("12 m")?.issues).toEqual([
      expect.objectContaining({ code: "length.implausible", severity: "warn", ec: "B8" }),
    ]);
  });
});

interface WeightCase {
  name: string;
  raw: string | null | undefined;
  grams: number | null;
  assumed?: boolean;
  codes?: string[];
  message?: string;
}

const weightCases: WeightCase[] = [
  { name: "EC-B7: '1.8 kg' is 1800 g", raw: "1.8 kg", grams: 1800, assumed: false, codes: [] },
  { name: "EC-B7: '1800 g' is 1800 g", raw: "1800 g", grams: 1800, assumed: false },
  { name: "EC-B7: '4 lbs' is 1814 g", raw: "4 lbs", grams: 1814, assumed: false },
  { name: "EC-B7: '2 lb 3 oz' is 992 g", raw: "2 lb 3 oz", grams: 992, assumed: false },
  { name: "EC-B7: '1 kg 200 g' is 1200 g", raw: "1 kg 200 g", grams: 1200, assumed: false },
  { name: "EC-B7: '1,8 kg' takes a comma decimal", raw: "1,8 kg", grams: 1800, assumed: false },
  { name: "EC-B7: '1.5kg' without a space", raw: "1.5kg", grams: 1500, assumed: false },
  { name: "EC-B7: '16 oz' is 454 g", raw: "16 oz", grams: 454, assumed: false },
  { name: "EC-B7: '1 pound' is 454 g", raw: "1 pound", grams: 454, assumed: false },
  { name: "EC-B7: '2 kilos' is 2000 g", raw: "2 kilos", grams: 2000 },
  { name: "EC-B7: '3 kilogram' is 3000 g", raw: "3 kilogram", grams: 3000 },
  { name: "EC-B7: '250 gramm' is 250 g", raw: "250 gramm", grams: 250 },
  { name: "EC-B7: '250 gr' is 250 g", raw: "250 gr", grams: 250 },
  { name: "EC-B7: '10 ounces' is 283 g", raw: "10 ounces", grams: 283 },
  { name: "EC-B7: 'Gewicht: 1,2 kg' ignores the label", raw: "Gewicht: 1,2 kg", grams: 1200 },
  { name: "EC-B7: bare '500' is grams", raw: "500", grams: 500, assumed: true, codes: ["unit.assumed"], message: "assumed grams" },
  { name: "EC-B7: bare '1.8' is kilograms", raw: "1.8", grams: 1800, assumed: true, codes: ["unit.assumed"], message: "assumed kilograms" },
  { name: "EC-B7: bare '0,5' is kilograms", raw: "0,5", grams: 500, assumed: true, message: "assumed kilograms" },
  { name: "EC-B7: bare '150.5' is grams, rounded", raw: "150.5", grams: 151, assumed: true, message: "assumed grams" },
  { name: "EC-B8: '600 kg' is kept but implausible", raw: "600 kg", grams: 600000, codes: ["weight.implausible"] },
  { name: "EC-B8: '0 g' is kept but implausible", raw: "0 g", grams: 0, codes: ["weight.implausible"] },
  { name: "EC-B13: empty string is null", raw: "", grams: null },
  { name: "EC-B13: 'n/a' is null", raw: "n/a", grams: null },
  { name: "EC-B13: null is null", raw: null, grams: null },
  { name: "'abc' is null", raw: "abc", grams: null },
  { name: "'-2 kg' is null", raw: "-2 kg", grams: null },
];

describe("parseWeight", () => {
  it.each(weightCases)("$name", (c) => {
    const result = parseWeight(c.raw);
    if (c.grams === null) {
      expect(result).toBeNull();
      return;
    }
    expect(result).not.toBeNull();
    expect(result?.grams).toBe(c.grams);
    expect(Number.isInteger(result?.grams)).toBe(true);
    if (c.assumed !== undefined) expect(result?.assumed).toBe(c.assumed);
    if (c.codes !== undefined) expect(result?.issues.map((i) => i.code)).toEqual(c.codes);
    if (c.message !== undefined) {
      expect(result?.issues.find((i) => i.code === "unit.assumed")?.message).toContain(c.message);
    }
  });

  it("EC-B8: weight.implausible carries ec B8 and warn severity", () => {
    expect(parseWeight("600 kg")?.issues).toEqual([
      expect.objectContaining({ code: "weight.implausible", severity: "warn", ec: "B8" }),
    ]);
  });
});

interface DimensionsCase {
  name: string;
  raw: string | null | undefined;
  dims: Dimensions | null;
  assumed?: boolean;
  codes?: string[];
}

const dimensionsCases: DimensionsCase[] = [
  { name: "EC-B7: 'H20 x W15 cm' maps labels", raw: "H20 x W15 cm", dims: { heightCm: 20, widthCm: 15 }, assumed: false, codes: [] },
  { name: "EC-B7: '20x15x10' assumes cm and L×W×H", raw: "20x15x10", dims: { lengthCm: 20, widthCm: 15, heightCm: 10 }, assumed: true, codes: ["unit.assumed", "dimensions.order_assumed"] },
  { name: "EC-B7: '20 × 15 × 10 cm' assumes order only", raw: "20 × 15 × 10 cm", dims: { lengthCm: 20, widthCm: 15, heightCm: 10 }, assumed: true, codes: ["dimensions.order_assumed"] },
  { name: "EC-B7: 'L: 20cm W: 15cm H: 10cm' maps every label", raw: "L: 20cm W: 15cm H: 10cm", dims: { lengthCm: 20, widthCm: 15, heightCm: 10 }, assumed: false, codes: [] },
  { name: "EC-B7: 'Ø 20 cm' is a diameter", raw: "Ø 20 cm", dims: { diameterCm: 20 }, assumed: false, codes: [] },
  { name: "EC-B7: '20 cm Ø' is a diameter with a trailing label", raw: "20 cm Ø", dims: { diameterCm: 20 }, assumed: false, codes: [] },
  { name: "EC-B7: 'ø20cm' without spaces", raw: "ø20cm", dims: { diameterCm: 20 } },
  { name: "EC-B7: '7.9 in x 5.9 in' converts each", raw: "7.9 in x 5.9 in", dims: { lengthCm: 20.1, widthCm: 15 }, assumed: true, codes: ["dimensions.order_assumed"] },
  { name: "EC-B7: '20,5 x 15 cm' takes the unit from the end", raw: "20,5 x 15 cm", dims: { lengthCm: 20.5, widthCm: 15 }, codes: ["dimensions.order_assumed"] },
  { name: "EC-B7: 'Höhe 20 cm, Breite 15 cm' German labels", raw: "Höhe 20 cm, Breite 15 cm", dims: { heightCm: 20, widthCm: 15 }, assumed: false, codes: [] },
  { name: "EC-B7: French labels with profondeur as length", raw: "hauteur 20 cm, largeur 15 cm, profondeur 10 cm", dims: { heightCm: 20, widthCm: 15, lengthCm: 10 }, assumed: false },
  { name: "EC-B7: 'H 20 x W 15 x D 10 cm' reads D as depth", raw: "H 20 x W 15 x D 10 cm", dims: { heightCm: 20, widthCm: 15, lengthCm: 10 } },
  { name: "EC-B7: 'H 20 x D 15 cm' reads D as diameter", raw: "H 20 x D 15 cm", dims: { heightCm: 20, diameterCm: 15 } },
  { name: "EC-B7: 'D 20 cm' alone is a diameter", raw: "D 20 cm", dims: { diameterCm: 20 } },
  { name: "EC-B7: 'dia 20 cm' is a diameter", raw: "dia 20 cm", dims: { diameterCm: 20 } },
  { name: "EC-B7: 'Durchmesser 20 cm' is a diameter", raw: "Durchmesser 20 cm", dims: { diameterCm: 20 } },
  { name: "EC-B7: 'diamètre 20 cm' is a diameter", raw: "diamètre 20 cm", dims: { diameterCm: 20 } },
  { name: "EC-B7: 'T 10 cm, B 15 cm, H 20 cm' Tiefe and Breite", raw: "T 10 cm, B 15 cm, H 20 cm", dims: { lengthCm: 10, widthCm: 15, heightCm: 20 }, assumed: false },
  { name: "EC-B7: 'H: 20 cm' single labelled value", raw: "H: 20 cm", dims: { heightCm: 20 } },
  { name: "EC-B7: 'H20xW15cm' with no spaces at all", raw: "H20xW15cm", dims: { heightCm: 20, widthCm: 15 } },
  { name: "EC-B7: '20 by 15 cm' separator word", raw: "20 by 15 cm", dims: { lengthCm: 20, widthCm: 15 } },
  { name: "EC-B7: '20 * 15 * 10 mm' converts millimetres", raw: "20 * 15 * 10 mm", dims: { lengthCm: 2, widthCm: 1.5, heightCm: 1 } },
  { name: "EC-B7: '20/15/10 cm' slash separator", raw: "20/15/10 cm", dims: { lengthCm: 20, widthCm: 15, heightCm: 10 } },
  { name: "EC-B7: '20 x 15 in' converts inches", raw: "20 x 15 in", dims: { lengthCm: 50.8, widthCm: 38.1 } },
  { name: "EC-B7: 'Maße: 20 x 15 x 10 cm' ignores a leading label word", raw: "Maße: 20 x 15 x 10 cm", dims: { lengthCm: 20, widthCm: 15, heightCm: 10 } },
  { name: "EC-B7: 'Set of 3 - 20 x 15 cm' does not read the count", raw: "Set of 3 - 20 x 15 cm", dims: { lengthCm: 20, widthCm: 15 } },
  { name: "EC-B7: 'H 20 x 15' fills the free slot and flags the order", raw: "H 20 x 15", dims: { heightCm: 20, lengthCm: 15 }, codes: ["unit.assumed", "dimensions.order_assumed"] },
  { name: "EC-B8: '2000 x 15 cm' flags the implausible length", raw: "2000 x 15 cm", dims: { lengthCm: 2000, widthCm: 15 }, codes: ["dimensions.order_assumed", "length.implausible"] },
  { name: "a single unlabelled number is not a dimension set", raw: "20 cm", dims: null },
  { name: "four numbers are not a dimension set", raw: "20 x 15 x 10 x 5 cm", dims: null },
  { name: "two numbers without a separator are not a dimension set", raw: "20 cm, 15 cm", dims: null },
  { name: "EC-B13: empty string is null", raw: "", dims: null },
  { name: "EC-B13: 'n/a' is null", raw: "n/a", dims: null },
  { name: "EC-B13: null is null", raw: null, dims: null },
  { name: "'abc' is null", raw: "abc", dims: null },
];

describe("parseDimensions", () => {
  it.each(dimensionsCases)("$name", (c) => {
    const result = parseDimensions(c.raw);
    if (c.dims === null) {
      expect(result).toBeNull();
      return;
    }
    expect(result).not.toBeNull();
    expect(result?.dims).toEqual(c.dims);
    if (c.assumed !== undefined) expect(result?.assumed).toBe(c.assumed);
    if (c.codes !== undefined) expect(result?.issues.map((i) => i.code)).toEqual(c.codes);
  });

  it("EC-B7: unit.assumed on dimensions carries ec B7", () => {
    expect(parseDimensions("20x15")?.issues).toContainEqual(
      expect.objectContaining({ code: "unit.assumed", severity: "info", ec: "B7" }),
    );
  });

  it("EC-B8: length.implausible on dimensions carries ec B8", () => {
    expect(parseDimensions("2000 x 15 cm")?.issues).toContainEqual(
      expect.objectContaining({ code: "length.implausible", severity: "warn", ec: "B8" }),
    );
  });
});

describe("formatCm", () => {
  it.each<[number, string]>([
    [20, "20 cm"],
    [20.5, "20.5 cm"],
    [20.04, "20 cm"],
    [20.06, "20.1 cm"],
    [0.1, "0.1 cm"],
    [1.15, "1.2 cm"],
    [0, "0 cm"],
  ])("formatCm(%j) → %j", (cm, expected) => {
    expect(formatCm(cm)).toBe(expected);
  });
});
