import "@/lib/env";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { aiRequests, products } from "@/db/schema";
import { createImport, updateImport } from "@/db/repositories/imports";
import { countProductsByStatus, findLiveImport, getStoreOverview, OVERVIEW_SERIES_DAYS } from "@/db/repositories/overview";
import { upsertProductFromGroup } from "@/db/repositories/products";
import { createStore, registerUser } from "@/lib/auth";
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

describe.skipIf(!process.env.DATABASE_URL)("store overview (integration)", () => {
  let db: Db;
  let storeId: string;
  let otherStoreId: string;
  let importId: string;

  beforeAll(async () => {
    resetConfigForTests();
    await runMigrations();
    db = getDb();
    const stamp = Date.now();
    const owner = await registerUser(db, { email: `ov-${stamp}@test.local`, password: "pw12345678", name: "Overview" });
    storeId = (await createStore(db, owner.id, { name: "Overview Store", slug: `ov-${stamp}` })).id;
    otherStoreId = (await createStore(db, owner.id, { name: "Other Store", slug: `ov-other-${stamp}` })).id;
    importId = (await createImport(db, { storeId, name: "overview.csv" })).id;
    await updateImport(db, importId, { totalRows: 12, counts: { pending: 2, processing: 0, done: 8, needs_review: 1, failed: 1 } });
    const now = new Date();
    const approved = await upsertProductFromGroup(db, storeId, importId, group(`OV-A-${stamp}`));
    const flagged = await upsertProductFromGroup(db, storeId, importId, group(`OV-R-${stamp}`));
    await upsertProductFromGroup(db, storeId, importId, group(`OV-P-${stamp}`));
    await db.update(products).set({ status: "approved", approvedAt: now }).where(eq(products.id, approved.productId));
    await db.update(products).set({ status: "needs_review", updatedAt: now }).where(eq(products.id, flagged.productId));
    await db.insert(aiRequests).values([
      { storeId, importId, purpose: "enrich", model: "mock-cheap", promptVersion: "v1", requestHash: `ov-${stamp}-1`, status: "succeeded", costMicros: 1500 },
      { storeId, importId, purpose: "enrich", model: "mock-cheap", promptVersion: "v1", requestHash: `ov-${stamp}-2`, status: "succeeded", costMicros: 500, createdAt: new Date(now.getTime() - 20 * 86_400_000) },
      { storeId, importId, purpose: "enrich", model: "mock-cheap", promptVersion: "v1", requestHash: `ov-${stamp}-3`, status: "succeeded", costMicros: 9_000_000, createdAt: new Date(now.getTime() - 40 * 86_400_000) },
    ]);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("counts every product status, with zeros for the empty ones", async () => {
    const counts = await countProductsByStatus(db, storeId);
    expect(counts.approved).toBe(1);
    expect(counts.needs_review).toBe(1);
    expect(counts.pending_ai).toBe(1);
    expect(counts.failed).toBe(0);
    expect(await countProductsByStatus(db, otherStoreId)).toMatchObject({ approved: 0, needs_review: 0, pending_ai: 0 });
  });

  it("finds the import the worker still owns and reports its finished rows", async () => {
    const live = await findLiveImport(db, storeId);
    expect(live).toMatchObject({ id: importId, name: "overview.csv", status: "uploading", totalRows: 12, finished: 10 });
    expect(await findLiveImport(db, otherStoreId)).toBeNull();
  });

  it("puts today's approvals, flags, imports and spend at the end of each series", async () => {
    const o = await getStoreOverview(db, storeId);
    expect(o.products).toMatchObject({ live: 1, needsReview: 1, approvedLast7: 1, flaggedLast7: 1 });
    expect(o.products.liveSeries).toHaveLength(OVERVIEW_SERIES_DAYS);
    expect(o.products.liveSeries.at(-1)).toBe(1);
    expect(o.products.reviewSeries.at(-1)).toBe(1);
    expect(o.imports).toMatchObject({ last7: 1, previous7: 0, rowsLast7: 12 });
    expect(o.imports.series.at(-1)).toBe(1);
    // 30-day spend includes the 20-day-old call but not the 40-day-old one; 7-day spend is today's only.
    expect(o.ai.spendMicros30d).toBe(2000);
    expect(o.ai.spendMicros7d).toBe(1500);
    expect(o.ai.series).toHaveLength(OVERVIEW_SERIES_DAYS);
    expect(o.ai.series.at(-1)).toBe(1500);
    expect(o.live?.id).toBe(importId);
  });

  it("EC-I1: another store's overview is empty", async () => {
    const o = await getStoreOverview(db, otherStoreId);
    expect(o.products.live).toBe(0);
    expect(o.imports.last7).toBe(0);
    expect(o.ai.spendMicros30d).toBe(0);
    expect(o.live).toBeNull();
  });
});
