import "@/lib/env";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { createImport, getImport } from "@/db/repositories/imports";
import { applyPhotoMatches, insertPhoto, listPhotosForImport } from "@/db/repositories/photos";
import { getProduct, upsertProductFromGroup } from "@/db/repositories/products";
import { listProducts } from "@/db/repositories/products-query";
import { createStore, getUserStore, registerUser } from "@/lib/auth";
import { resetConfigForTests } from "@/lib/config";
import type { ProductGroup } from "@/core/types";

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

/** EC-I1: nothing from one store is reachable through another store's scope. */
describe.skipIf(!process.env.DATABASE_URL)("store isolation (integration)", () => {
  let db: Db;
  let storeA: string;
  let storeB: string;
  let userB: string;
  let importA: string;
  let productA: string;

  beforeAll(async () => {
    resetConfigForTests();
    await runMigrations();
    db = getDb();
    const stamp = Date.now();
    const a = await registerUser(db, { email: `iso-a-${stamp}@test.local`, password: "pw12345678", name: "A" });
    const b = await registerUser(db, { email: `iso-b-${stamp}@test.local`, password: "pw12345678", name: "B" });
    userB = b.id;
    storeA = (await createStore(db, a.id, { name: "Store A", slug: `iso-a-${stamp}` })).id;
    storeB = (await createStore(db, b.id, { name: "Store B", slug: `iso-b-${stamp}` })).id;
    importA = (await createImport(db, { storeId: storeA, name: "a.csv" })).id;
    productA = (await upsertProductFromGroup(db, storeA, importA, group(`ISO-${stamp}`))).productId;
  });

  afterAll(async () => {
    await closeDb();
  });

  it("EC-I1: a product is invisible through another store's scope", async () => {
    expect(await getProduct(db, storeA, productA)).not.toBeNull();
    expect(await getProduct(db, storeB, productA)).toBeNull();
    const listB = await listProducts(db, storeB, {});
    expect(listB.items.find((p) => p.id === productA)).toBeUndefined();
    const listA = await listProducts(db, storeA, {});
    expect(listA.items.some((p) => p.id === productA)).toBe(true);
  });

  it("EC-I1: an import is invisible through another store's scope", async () => {
    expect(await getImport(db, storeA, importA)).not.toBeNull();
    expect(await getImport(db, storeB, importA)).toBeNull();
  });

  it("EC-I1: membership decides which store slugs a user can open", async () => {
    const [{ slug: slugA }] = await db.execute<{ slug: string }>(`select slug from stores where id = '${storeA}'`).then((r) => r.rows);
    expect(await getUserStore(db, userB, slugA)).toBeNull();
  });

  it("EC-C10: the same product key in two stores creates two independent products", async () => {
    const stamp = Date.now();
    const a = await upsertProductFromGroup(db, storeA, importA, group(`SHARED-${stamp}`));
    const importB = (await createImport(db, { storeId: storeB, name: "b.csv" })).id;
    const b = await upsertProductFromGroup(db, storeB, importB, group(`SHARED-${stamp}`));
    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.productId).not.toBe(b.productId);
  });

  it("EC-I1: a photo matched by key or SKU attaches only to this store's product, never to the same key elsewhere", async () => {
    const stamp = Date.now();
    const key = `PHOTO-${stamp}`;
    // Store A owns the key first; the photo arrives in store B, which also has the key.
    await upsertProductFromGroup(db, storeA, importA, group(key));
    const importB = (await createImport(db, { storeId: storeB, name: "b-photos.csv" })).id;
    const b = await upsertProductFromGroup(db, storeB, importB, group(key));
    const blobId = crypto.randomUUID();
    await insertPhoto(db, { storeId: storeB, importId: importB, blobId, thumbBlobId: blobId, sha256: `sha-${stamp}`, originalName: `${key}-1.jpg`, width: 10, height: 10, status: "unmatched" });

    const applied = await applyPhotoMatches(db, storeB, importB, [{ filename: `${key}-1.jpg`, productKey: key, sku: `${key}-1`, position: 0, method: "sku", score: 95 }]);
    expect(applied.matched).toBe(1);
    const [photo] = await listPhotosForImport(db, importB);
    expect(photo?.productId).toBe(b.productId);
    expect(photo?.variantId).not.toBeNull();
    const variantInB = await db.execute<{ store_id: string }>(`select store_id from variants where id = '${photo?.variantId}'`).then((r) => r.rows[0]);
    expect(variantInB?.store_id).toBe(storeB);
  });
});
