import "@/lib/env";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { createImport } from "@/db/repositories/imports";
import { importRows } from "@/db/schema";
import { createStore, registerUser } from "@/lib/auth";
import { resetConfigForTests } from "@/lib/config";
import { failChunkRows, insertRawRows, ROW_CHUNK_SIZE, setRowsStatusForProduct } from "./rows";

describe.skipIf(!process.env.DATABASE_URL)("rows repository (integration)", () => {
  let db: Db;
  let storeId: string;

  beforeAll(async () => {
    resetConfigForTests();
    await runMigrations();
    db = getDb();
    const stamp = Date.now();
    const user = await registerUser(db, { email: `rows-${stamp}@test.local`, password: "pw12345678", name: "Rows" });
    storeId = (await createStore(db, user.id, { name: "Rows Store", slug: `rows-${stamp}` })).id;
  });

  afterAll(async () => {
    await closeDb();
  });

  async function statusesOf(importId: string): Promise<string[]> {
    const rows = await db.select({ status: importRows.status }).from(importRows).where(eq(importRows.importId, importId)).orderBy(importRows.rowNumber);
    return rows.map((r) => r.status);
  }

  it("EC-E8: a product's outcome only rewrites the rows of the import that produced it", async () => {
    const productId = crypto.randomUUID();
    const a = await createImport(db, { storeId, name: "a.csv" });
    const b = await createImport(db, { storeId, name: "b.csv" });
    for (const imp of [a, b]) {
      await insertRawRows(db, imp.id, storeId, [{ rowNumber: 1, cells: { title: "x" } }]);
      await db.update(importRows).set({ productId }).where(eq(importRows.importId, imp.id));
    }
    await setRowsStatusForProduct(db, productId, "done", null, a.id);
    expect(await setRowsStatusForProduct(db, productId, "failed", "AI declined", b.id)).toBe(1);
    expect(await statusesOf(a.id)).toEqual(["done"]);
    expect(await statusesOf(b.id)).toEqual(["failed"]);
  });

  it("EC-E9: a dead clean job's chunk ends Failed with the reason; rows already cleaned are left alone", async () => {
    const imp = await createImport(db, { storeId, name: "chunks.csv" });
    const rows = Array.from({ length: ROW_CHUNK_SIZE + 2 }, (_, i) => ({ rowNumber: i + 1, cells: { title: `row ${i + 1}` } }));
    await insertRawRows(db, imp.id, storeId, rows);
    await db.update(importRows).set({ stage: "cleaned" }).where(and(eq(importRows.importId, imp.id), eq(importRows.rowNumber, 1)));

    expect(await failChunkRows(db, imp.id, 0, "Cleaning failed repeatedly: boom")).toBe(ROW_CHUNK_SIZE - 1);
    const all = await db.select().from(importRows).where(eq(importRows.importId, imp.id)).orderBy(importRows.rowNumber);
    expect(all[0]?.status).toBe("pending");
    expect(all[1]?.status).toBe("failed");
    expect(all[1]?.stage).toBe("done");
    expect(all[1]?.failureReason).toBe("Cleaning failed repeatedly: boom");
    // The next chunk is untouched.
    expect(all[ROW_CHUNK_SIZE]?.stage).toBe("parsed");
    expect(all[ROW_CHUNK_SIZE]?.status).toBe("pending");
    // Idempotent: a second call finds nothing left to fail.
    expect(await failChunkRows(db, imp.id, 0, "again")).toBe(0);
  });
});
