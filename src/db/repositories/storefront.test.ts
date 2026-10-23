import "@/lib/env";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { listStorefrontCategories, listStorefrontCategoryPhotos } from "@/db/repositories/storefront";
import { resetConfigForTests } from "@/lib/config";

/** The raw SQL behind the category loaders must parse and respect the store scope; a store nobody owns sees nothing. */
describe.skipIf(!process.env.DATABASE_URL)("storefront category queries (integration)", () => {
  beforeAll(async () => {
    resetConfigForTests();
    await runMigrations();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("lists no categories and no category photos for an unknown store", async () => {
    const storeId = randomUUID();
    expect(await listStorefrontCategories(getDb(), storeId, "en")).toEqual([]);
    expect(await listStorefrontCategoryPhotos(getDb(), storeId, "en")).toEqual([]);
  });
});
