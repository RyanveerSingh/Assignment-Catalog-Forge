import "@/lib/env";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { createImport } from "@/db/repositories/imports";
import { products } from "@/db/schema";
import type { ProductGroup } from "@/core/types";
import { createStore, registerUser } from "@/lib/auth";
import { resetConfigForTests } from "@/lib/config";
import { upsertProductFromGroup, type UpsertGroupResult } from "./products";

function group(key: string, hash: string): ProductGroup {
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
    sourceHash: hash,
  };
}

describe.skipIf(!process.env.DATABASE_URL)("products repository (integration)", () => {
  let db: Db;
  let storeId: string;

  beforeAll(async () => {
    resetConfigForTests();
    await runMigrations();
    db = getDb();
    const stamp = Date.now();
    const user = await registerUser(db, { email: `prod-${stamp}@test.local`, password: "pw12345678", name: "Prod" });
    storeId = (await createStore(db, user.id, { name: "Products Store", slug: `prod-${stamp}` })).id;
  });

  afterAll(async () => {
    await closeDb();
  });

  it("EC-E8: two imports creating the same new product at once end with one product and no unique-key error", async () => {
    const key = `RACE-${Date.now()}`;
    const a = await createImport(db, { storeId, name: "a.csv" });
    const b = await createImport(db, { storeId, name: "b.csv" });

    // Import A takes the product and holds its transaction open; import B starts meanwhile. With
    // the lock taken after the existence check, B would see "no product yet", wait for A, then hit
    // the unique key on insert.
    let releaseA: () => void = () => undefined;
    const holdA = new Promise<void>((r) => {
      releaseA = r;
    });
    let aUpserted: () => void = () => undefined;
    const aHasLock = new Promise<void>((r) => {
      aUpserted = r;
    });
    const txA = db.transaction(async (tx) => {
      const res = await upsertProductFromGroup(tx, storeId, a.id, group(key, "hash-a"));
      aUpserted();
      await holdA;
      return res;
    });
    await aHasLock;
    const txB = db.transaction((tx) => upsertProductFromGroup(tx, storeId, b.id, group(key, "hash-b")));
    // Give B time to reach the lock before A commits.
    await new Promise((r) => setTimeout(r, 300));
    releaseA();
    const [resA, resB] = (await Promise.all([txA, txB])) as [UpsertGroupResult, UpsertGroupResult];

    expect(resA.created).toBe(true);
    expect(resB.created).toBe(false);
    expect(resB.productId).toBe(resA.productId);
    expect(resB.sourceChanged).toBe(true);
    const rows = await db.select().from(products).where(and(eq(products.storeId, storeId), eq(products.productKey, key)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lastImportId).toBe(b.id);
  });
});
