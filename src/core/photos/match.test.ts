import { describe, expect, it } from "vitest";
import type { ProductGroup, VariantDraft } from "../types";
import { matchPhotos, normalizePhotoStem } from "./match";

function makeVariant(sku: string, images: string[] = []): VariantDraft {
  return {
    sku,
    skuDisplay: sku,
    synthetic: false,
    options: {},
    priceCents: null,
    currency: null,
    compareAtCents: null,
    weightGrams: null,
    dimensions: null,
    images,
    quantity: null,
    barcode: null,
    sourceRows: [1],
    issues: [],
  };
}

function makeGroup(productKey: string, title: string | null, variants: VariantDraft[], images: string[] = []): ProductGroup {
  return {
    productKey,
    keySource: "sku_stem",
    title,
    descriptionHtml: null,
    descriptionText: null,
    category: null,
    brand: null,
    tags: [],
    notes: null,
    care: null,
    material: null,
    color: null,
    attributes: {},
    variants,
    sourceRows: [1],
    duplicateRows: [],
    conflicts: [],
    issues: [],
    language: { lang: "en", confidence: 80 },
    images: [...new Set([...images, ...variants.flatMap((v) => v.images)])],
    sourceCorpus: "",
    complexity: 0,
    sourceHash: "x",
  };
}

describe("normalizePhotoStem", () => {
  it.each([
    ["TC-PL-20_2.jpg", "tc pl 20", 2],
    ["tc-pl-20 (2).png", "tc pl 20", 2],
    ["TC-PL-20-02.JPG", "tc pl 20", 2],
    ["TC-PL-20.jpg", "tc pl 20", null],
    ["TC-PL-20_front.jpg", "tc pl 20", null],
    ["TC-PL-20_back.jpg", "tc pl 20", null],
    ["TC-PL-20_main.webp", "tc pl 20", null],
    ["TC-PL-20_alt1.jpg", "tc pl 20", 1],
    ["TC-PL-20_front_2.jpg", "tc pl 20", 2],
    ["photos/TC-PL-20_2.jpg", "tc pl 20", 2],
    ["a\\b\\TC-PL-20.jpeg", "tc pl 20", null],
    ["../../x.jpg", "x", null],
    ["Terracotta Planter.jpg", "terracotta planter", null],
    ["noext", "noext", null],
    ["", "", null],
  ])("EC-C12: %j -> stem %j, sequence %j", (filename, stem, sequence) => {
    expect(normalizePhotoStem(filename)).toEqual({ stem, sequence });
  });

  it("never throws on non-string input", () => {
    expect(normalizePhotoStem(undefined as unknown as string)).toEqual({ stem: "", sequence: null });
  });
});

describe("matchPhotos", () => {
  const planter = makeGroup(
    "TC-PL",
    "Terracotta Planter",
    [makeVariant("TC-PL-20", ["planter-front.jpg"]), makeVariant("TC-PL-30")],
    ["planter-hero.jpg", "https://cdn.example.com/planter.jpg"],
  );
  const mug = makeGroup("CM", "Ceramic Mug", [makeVariant("CM-RED"), makeVariant("CM-BLUE")]);

  it("EC-C12: climbs the ladder image column → SKU → SKU stem → handle → fuzzy", () => {
    const files = ["planter-front.jpg", "planter-hero.jpg", "TC-PL-30.jpg", "TC-PL.jpg", "terracotta-planter.jpg", "TC-PL-3O.jpg"];
    const { matches } = matchPhotos(files, [planter, mug]);
    expect(matches.map((m) => [m.filename, m.method, m.score, m.productKey, m.sku])).toEqual([
      ["planter-front.jpg", "image_column", 100, "TC-PL", "TC-PL-20"],
      ["planter-hero.jpg", "image_column", 100, "TC-PL", null],
      ["TC-PL-30.jpg", "sku", 95, "TC-PL", "TC-PL-30"],
      ["TC-PL.jpg", "sku_stem", 85, "TC-PL", null],
      ["terracotta-planter.jpg", "handle", 80, "TC-PL", null],
      ["TC-PL-3O.jpg", "fuzzy", 60, "TC-PL", "TC-PL-30"],
    ]);
  });

  it("EC-C12: sequence markers set the position; the rest fill the gaps in filename order", () => {
    const files = ["TC-PL-30_2.jpg", "TC-PL-30.jpg", "tc-pl-30 (3).png", "TC-PL-30_back.jpg", "CM-RED.jpg"];
    const { matches } = matchPhotos(files, [planter, mug]);
    expect(matches.map((m) => [m.filename, m.sku, m.position])).toEqual([
      ["TC-PL-30_2.jpg", "TC-PL-30", 1],
      ["TC-PL-30.jpg", "TC-PL-30", 0],
      ["tc-pl-30 (3).png", "TC-PL-30", 2],
      ["TC-PL-30_back.jpg", "TC-PL-30", 3],
      ["CM-RED.jpg", "CM-RED", 0],
    ]);
  });

  it("EC-C12: a name that is a SKU in full beats the same name read as stem + sequence", () => {
    const group = makeGroup("TC-PL", "Planter", [makeVariant("TC-PL-2"), makeVariant("TC-PL-20")]);
    const { matches } = matchPhotos(["TC-PL-2.jpg", "TC-PL-20_2.jpg"], [group]);
    expect(matches.map((m) => [m.sku, m.method, m.position])).toEqual([
      ["TC-PL-2", "sku", 0],
      ["TC-PL-20", "sku", 1],
    ]);
  });

  it("EC-A17: only the basename counts; folder paths and traversal are ignored but the filename is kept as given", () => {
    const { matches } = matchPhotos(["photos/sub/TC-PL-20.jpg", "..\\..\\TC-PL-30.jpg"], [planter]);
    expect(matches.map((m) => [m.filename, m.sku, m.method])).toEqual([
      ["photos/sub/TC-PL-20.jpg", "TC-PL-20", "sku"],
      ["..\\..\\TC-PL-30.jpg", "TC-PL-30", "sku"],
    ]);
  });

  it("EC-C13: photos that match nothing go to the unmatched bin with method 'none'", () => {
    const { matches } = matchPhotos(["random.jpg", "IMG_0001.jpg"], [planter, mug]);
    expect(matches).toEqual([
      { filename: "random.jpg", productKey: null, sku: null, position: 0, method: "none", score: 0 },
      { filename: "IMG_0001.jpg", productKey: null, sku: null, position: 1, method: "none", score: 0 },
    ]);
  });

  it("EC-C13: fuzzy matching refuses ties and short stems", () => {
    const abc = makeGroup("ABC", "Alpha", [makeVariant("ABC-100"), makeVariant("ABC-200")]);
    const short = makeGroup("P1", "Zzz", [makeVariant("ABCD1")]);
    const { matches } = matchPhotos(["ABC-300.jpg", "ABCDE.jpg"], [abc, short]);
    expect(matches.map((m) => m.method)).toEqual(["none", "none"]);
  });

  it("EC-C15: referenced filenames missing from the upload are reported; URLs are not", () => {
    const { missingReferences } = matchPhotos(["planter-front.jpg"], [planter, mug]);
    expect(missingReferences).toEqual([{ productKey: "TC-PL", filename: "planter-hero.jpg" }]);
  });

  it("EC-C15: a reference is satisfied by a photo in a subfolder or with a different extension", () => {
    const { missingReferences } = matchPhotos(["zip/planter-front.png", "planter-hero.jpeg"], [planter]);
    expect(missingReferences).toEqual([]);
  });

  it("the same image name claimed by several variants is a product-level match, not a variant one", () => {
    const shared = makeGroup("SH", "Shared", [makeVariant("SH-1", ["shared.jpg"]), makeVariant("SH-2", ["shared.jpg"])]);
    const { matches } = matchPhotos(["shared.jpg"], [shared]);
    expect(matches[0]).toMatchObject({ method: "image_column", productKey: "SH", sku: null });
  });

  it("handles empty and malformed input without throwing", () => {
    expect(matchPhotos([], [])).toEqual({ matches: [], missingReferences: [] });
    expect(matchPhotos(["", 3 as unknown as string], [planter]).matches).toEqual([]);
    expect(matchPhotos(undefined as unknown as string[], undefined as unknown as ProductGroup[])).toEqual({ matches: [], missingReferences: [] });
  });
});
