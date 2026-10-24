import "@/lib/env";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb, type Db } from "@/db/client";
import { runMigrations } from "@/db/migrate";
import { createImport, getImportById, updateImport } from "@/db/repositories/imports";
import { insertRawRows } from "@/db/repositories/rows";
import { importRows, jobs, products, translations, type ProductContent } from "@/db/schema";
import { createStore, registerUser } from "@/lib/auth";
import { resetConfigForTests } from "@/lib/config";
import { sha256Hex } from "@/lib/crypto";
import { driveImport } from "./drive";
import { JOB_TYPES, jobKeys } from "./keys";
import { onJobDead, settleUnhandledDeadJobs } from "./registry";

const content = (title: string): ProductContent => ({
  title,
  descriptionHtml: `<p>${title} for the windowsill</p>`,
  category: null,
  tags: [],
  attributes: {},
  seo: { metaTitle: null, metaDescription: null },
});

/** Dead jobs must close out what they owned and let the import finish; the reconciler must not revive them. */
describe.skipIf(!process.env.DATABASE_URL)("dead job handling (integration)", () => {
  let db: Db;
  let storeId: string;
  let seq = 0;

  beforeAll(async () => {
    resetConfigForTests();
    await runMigrations();
    db = getDb();
    const stamp = Date.now();
    const user = await registerUser(db, { email: `dead-${stamp}@test.local`, password: "pw12345678", name: "Dead Jobs" });
    storeId = (await createStore(db, user.id, { name: "Dead Jobs Store", slug: `dead-${stamp}` })).id;
  });

  afterAll(async () => {
    await closeDb();
  });

  async function translatingImportWithProduct(title: string): Promise<{ importId: string; productId: string }> {
    const imp = await createImport(db, { storeId, name: `${title}.csv` });
    await updateImport(db, imp.id, { status: "translating" });
    seq += 1;
    const [p] = await db
      .insert(products)
      .values({ storeId, productKey: `DEAD-${Date.now()}-${seq}`, handle: `dead-${Date.now()}-${seq}`, status: "draft", draft: content(title), lastImportId: imp.id })
      .returning({ id: products.id });
    return { importId: imp.id, productId: p!.id };
  }

  async function jobByKey(key: string): Promise<typeof jobs.$inferSelect> {
    const [j] = await db.select().from(jobs).where(eq(jobs.key, key));
    if (!j) throw new Error(`no job ${key}`);
    return j;
  }

  async function killJob(key: string, ageMinutes = 0): Promise<typeof jobs.$inferSelect> {
    await db.execute(sql`
      update jobs set status = 'dead', attempts = max_attempts, last_error = 'provider kept failing',
                      updated_at = now() - make_interval(mins => ${ageMinutes})
       where key = ${key}`);
    return jobByKey(key);
  }

  it("EC-E9: a dead translate job is not revived by the driver; onDead falls back to English and the import finalizes", async () => {
    const { importId, productId } = await translatingImportWithProduct("Blue Pot");
    // A good German title already exists and a merchant fixed the French one: both must survive.
    await db.insert(translations).values([
      { productId, storeId, field: "title", locale: "de", sourceHash: sha256Hex("Blue Pot"), text: "Blauer Topf", status: "fresh", origin: "ai" },
      { productId, storeId, field: "title", locale: "fr", sourceHash: sha256Hex("Blue Pot"), text: "Pot bleu", status: "fresh", origin: "manual" },
    ]);
    await driveImport(db, importId);
    const key = jobKeys.translate(productId);
    expect((await jobByKey(key)).status).toBe("queued");
    const dead = await killJob(key);

    // The 30 s reconciler runs again: the poison job stays dead and nothing new is queued for it.
    await driveImport(db, importId);
    expect((await jobByKey(key)).status).toBe("dead");
    expect((await getImportById(db, importId))?.status).toBe("translating");

    await onJobDead(dead, "provider kept failing", db);
    const rows = await db.select().from(translations).where(eq(translations.productId, productId));
    const byKey = new Map(rows.map((t) => [`${t.locale}:${t.field}`, t] as const));
    expect(byKey.get("de:title")?.status).toBe("fresh");
    expect(byKey.get("fr:title")?.origin).toBe("manual");
    expect(byKey.get("fr:title")?.text).toBe("Pot bleu");
    expect(byKey.get("de:descriptionHtml")?.status).toBe("failed");
    expect(byKey.get("fr:descriptionHtml")?.status).toBe("failed");
    expect(byKey.get("de:descriptionHtml")?.error).toMatch(/provider kept failing/);
    const [p] = await db.select().from(products).where(eq(products.id, productId));
    expect(p?.translatedAt).not.toBeNull();
    expect((await getImportById(db, importId))?.status).toBe("finalizing");
    expect((await jobByKey(jobKeys.finalize(importId))).status).toBe("queued");
    expect((await jobByKey(key)).status).toBe("dead");
  });

  it("EC-E9: a product whose translate job died is translated again once its English changes", async () => {
    const { importId, productId } = await translatingImportWithProduct("Green Vase");
    await driveImport(db, importId);
    const key = jobKeys.translate(productId);
    await killJob(key);
    await db.update(products).set({ draft: content("Green Vase, large") }).where(eq(products.id, productId));
    await driveImport(db, importId);
    const revived = await jobByKey(key);
    expect(revived.status).toBe("queued");
    expect(revived.attempts).toBe(0);
  });

  it("EC-E9: the reconciler closes out a dead translate job whose onDead never ran", async () => {
    const { importId, productId } = await translatingImportWithProduct("Red Bowl");
    await driveImport(db, importId);
    await killJob(jobKeys.translate(productId), 5);
    expect(await settleUnhandledDeadJobs(db)).toBeGreaterThanOrEqual(1);
    const [p] = await db.select().from(products).where(eq(products.id, productId));
    expect(p?.translatedAt).not.toBeNull();
    expect((await getImportById(db, importId))?.status).toBe("finalizing");
    // Settled work is not picked up again.
    const again = await db.execute<{ n: number }>(sql`select count(*)::int as n from products where id = ${productId} and translated_at is null`);
    expect(Number(again.rows[0]?.n)).toBe(0);
  });

  it("EC-E9: a dead clean job marks its chunk's rows Failed so the import moves on and counts add up", async () => {
    const imp = await createImport(db, { storeId, name: "poison.csv" });
    await insertRawRows(db, imp.id, storeId, [1, 2, 3].map((n) => ({ rowNumber: n, cells: { title: `row ${n}` } })));
    await updateImport(db, imp.id, { status: "cleaning", totalRows: 3 });
    const key = jobKeys.clean(imp.id, 0);
    await db.insert(jobs).values({ key, type: JOB_TYPES.clean, queue: "default", payload: { chunk: 0 }, status: "dead", attempts: 5, maxAttempts: 5, storeId, importId: imp.id, lastError: "boom" });

    // The driver must not hand the poison chunk out again.
    await driveImport(db, imp.id);
    expect((await jobByKey(key)).status).toBe("dead");
    expect((await getImportById(db, imp.id))?.status).toBe("cleaning");

    await onJobDead(await jobByKey(key), "boom", db);
    const rows = await db.select().from(importRows).where(and(eq(importRows.importId, imp.id)));
    expect(rows.every((r) => r.status === "failed" && r.stage === "done" && /boom/.test(r.failureReason ?? ""))).toBe(true);
    const after = await getImportById(db, imp.id);
    expect(after?.counts.failed).toBe(3);
    expect(after?.status).toBe("grouping");
  });
});
