import "@/lib/env";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { createImport } from "@/db/repositories/imports";
import { upsertProductFromGroup } from "@/db/repositories/products";
import { approveProduct, cleanManualTranslation, setManualTranslation } from "@/db/repositories/review";
import { products, storefrontProducts, translations, type ProductContent } from "@/db/schema";
import { republishIfLive } from "@/jobs/publish";
import { createStore, registerUser } from "@/lib/auth";
import { resetConfigForTests } from "@/lib/config";
import type { ProductGroup } from "@/core/types";

const SCRIPT = `<p>Gut</p><script>alert(document.cookie)</script>`;
const IMG_ONERROR = `<img src=x onerror="alert(1)">Titel`;

/** Markers that must never survive into anything the storefront renders. */
function assertInert(value: string | null | undefined): void {
  const v = value ?? "";
  expect(v).not.toMatch(/<script/i);
  expect(v).not.toMatch(/onerror/i);
  expect(v).not.toMatch(/<img/i);
  expect(v).not.toMatch(/javascript:/i);
}

describe("cleanManualTranslation", () => {
  it.each([
    ["descriptionHtml", SCRIPT, "<p>Gut</p>"],
    ["descriptionHtml", `<p onclick="x()">Hallo <img src=x onerror=alert(1)></p>`, "<p>Hallo </p>"],
    ["descriptionHtml", `<a href="javascript:alert(1)">klick</a>`, "klick"],
    ["descriptionHtml", "<p>Topf <strong>aus Ton</strong></p>", "<p>Topf <strong>aus Ton</strong></p>"],
  ])("EC-B11: a manual %s translation keeps only allowlisted markup (%s)", (field, input, expected) => {
    const r = cleanManualTranslation(field, input);
    expect(r.ok).toBe(true);
    if (r.ok) {
      assertInert(r.text);
      expect(r.text).toBe(expected);
    }
  });

  it.each([
    ["title", IMG_ONERROR, "Titel"],
    ["metaTitle", "<b>Kaktus</b> im Topf", "Kaktus im Topf"],
    ["metaDescription", "&lt;script&gt;alert(1)&lt;/script&gt;Schön", "scriptalert(1)/scriptSchön"],
    ["attributes.material", "<i>Keramik</i>", "Keramik"],
    ["title", "Tom & Jerry", "Tom & Jerry"],
  ])("EC-I3: a manual %s translation is stored as plain text (%s)", (field, input, expected) => {
    const r = cleanManualTranslation(field, input);
    expect(r).toEqual({ ok: true, text: expected });
  });

  it.each([["title", "<p></p>"], ["descriptionHtml", "<script>x</script>"], ["metaTitle", "   "]])("EC-I3: %s with nothing left after cleaning is stored as null (%s)", (field, input) => {
    expect(cleanManualTranslation(field, input)).toEqual({ ok: true, text: null });
  });

  it.each(["handle", "attributes.", "seo", ""])("refuses an unknown field %j", (field) => {
    expect(cleanManualTranslation(field, "x")).toEqual({ ok: false });
  });
});

function group(key: string): ProductGroup {
  return {
    productKey: key,
    keySource: "single_row",
    title: `Product ${key}`,
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
    variants: [{ sku: `${key}-1`, skuDisplay: `${key}-1`, synthetic: false, options: {}, priceCents: 100, currency: "EUR", compareAtCents: null, weightGrams: null, dimensions: null, images: [], quantity: null, barcode: null, sourceRows: [1], issues: [] }],
    sourceRows: [1],
    duplicateRows: [],
    conflicts: [],
    issues: [],
    language: { lang: "en", confidence: 90 },
    images: [],
    sourceCorpus: `Title: Product ${key}`,
    complexity: 0,
    sourceHash: `hash-${key}`,
  };
}

const DRAFT: ProductContent = {
  title: "Terracotta pot",
  descriptionHtml: "<p>A clay pot with a drainage hole.</p>",
  category: "Pots",
  tags: [],
  attributes: { material: "Clay" },
  seo: { metaTitle: "Terracotta pot", metaDescription: "A clay pot." },
};

/** A manual or AI translation carrying script must never reach storefront_products (EC-B11, I3). */
describe.skipIf(!process.env.DATABASE_URL)("translation XSS barrier (integration)", () => {
  let db: Db;
  let storeId: string;
  let productId: string;

  beforeAll(async () => {
    resetConfigForTests();
    await runMigrations();
    db = getDb();
    const stamp = Date.now();
    const user = await registerUser(db, { email: `xss-${stamp}@test.local`, password: "pw12345678", name: "X" });
    storeId = (await createStore(db, user.id, { name: "XSS store", slug: `xss-${stamp}` })).id;
    const importId = (await createImport(db, { storeId, name: "x.csv" })).id;
    productId = (await upsertProductFromGroup(db, storeId, importId, group(`XSS-${stamp}`))).productId;
    await db.update(products).set({ draft: DRAFT, status: "draft" }).where(eq(products.id, productId));
    expect(await approveProduct(db, storeId, productId, null)).toEqual({ ok: true });
  });

  afterAll(async () => {
    await closeDb();
  });

  async function storefrontRow(locale: string) {
    const [row] = await db.select().from(storefrontProducts).where(and(eq(storefrontProducts.productId, productId), eq(storefrontProducts.locale, locale)));
    return row;
  }

  it("EC-I3: a manual <script> description translation is sanitised before storage and on the storefront", async () => {
    expect(await setManualTranslation(db, storeId, productId, "descriptionHtml", "de", SCRIPT, null)).toEqual({ ok: true });
    const [t] = await db.select().from(translations).where(and(eq(translations.productId, productId), eq(translations.field, "descriptionHtml"), eq(translations.locale, "de")));
    assertInert(t?.text);
    const de = await storefrontRow("de");
    expect(de?.descriptionHtml).toContain("Gut");
    assertInert(de?.descriptionHtml);
  });

  it("EC-I3: a manual <img onerror> title translation reaches the storefront as plain text", async () => {
    expect(await setManualTranslation(db, storeId, productId, "title", "fr", IMG_ONERROR, null)).toEqual({ ok: true });
    const fr = await storefrontRow("fr");
    expect(fr?.title).toBe("Titel");
  });

  it("EC-B11: publish re-sanitises a raw translation already in the table (AI output or a row stored before the fix)", async () => {
    await db
      .update(translations)
      .set({ text: `<p>Roh</p><img src=x onerror=alert(1)><script>alert(2)</script>`, origin: "ai", status: "fresh" })
      .where(and(eq(translations.productId, productId), eq(translations.field, "descriptionHtml"), eq(translations.locale, "de")));
    await republishIfLive(db, storeId, productId);
    const de = await storefrontRow("de");
    expect(de?.descriptionHtml).toContain("Roh");
    assertInert(de?.descriptionHtml);
  });

  it("EC-B11: publish sanitises the English description too", async () => {
    const [p] = await db.select({ published: products.published }).from(products).where(eq(products.id, productId));
    const published = p?.published;
    expect(published).toBeTruthy();
    if (!published) return;
    await db.update(products).set({ published: { ...published, descriptionHtml: `<p>Pot</p><iframe src="https://evil.test"></iframe><script>x()</script>` } }).where(eq(products.id, productId));
    await republishIfLive(db, storeId, productId);
    const en = await storefrontRow("en");
    expect(en?.descriptionHtml).toContain("Pot");
    assertInert(en?.descriptionHtml);
    expect(en?.descriptionHtml ?? "").not.toMatch(/<iframe/i);
  });
});
