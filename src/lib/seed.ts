import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { imports, stores, users } from "@/db/schema";
import { createStore, registerUser } from "./auth";
import { DEMO_EMAIL, DEMO_PASSWORD } from "./demo-lockdown";
import { getLogger } from "./logger";
import { acceptUpload } from "./upload";

export { DEMO_EMAIL, DEMO_PASSWORD };

/**
 * Demo accounts for the live demo and local development. Idempotent, safe to run on every boot.
 * Two stores exist to show that data never leaks between stores (EC-I1).
 */
export async function seedDemo(db: Db): Promise<void> {
  const log = getLogger({ component: "seed" });
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  let userId = existing?.id;
  if (!userId) {
    const user = await registerUser(db, { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Demo Merchant" });
    userId = user.id;
    log.info("created demo user");
  }
  for (const s of [
    { name: "Demo Store", slug: "demo", defaultCurrency: "EUR" },
    { name: "Second Store", slug: "second", defaultCurrency: "GBP" },
  ]) {
    const [found] = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, s.slug)).limit(1);
    if (!found) {
      await createStore(db, userId, s);
      log.info({ slug: s.slug }, "created demo store");
    }
  }
}

const SHOWCASE_SHEET = path.join("samples", "new-12.csv");
const SHOWCASE_PHOTOS = path.join("samples", "photos-new-12.zip");

/**
 * A fresh deployment should open on a shop, not an empty table: the first boot imports the new-12
 * sample with its photos into the demo store and auto-publishes everything that passes the checks.
 * Runs once (skipped when the store already has an import) and never throws out of boot.
 */
export async function seedShowcase(db: Db): Promise<void> {
  const log = getLogger({ component: "seed" });
  const [store] = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, "demo")).limit(1);
  if (!store) return;
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(imports).where(eq(imports.storeId, store.id));
  if ((count?.n ?? 0) > 0) return;
  const sheetPath = path.resolve(SHOWCASE_SHEET);
  const photosPath = path.resolve(SHOWCASE_PHOTOS);
  if (!existsSync(sheetPath) || !existsSync(photosPath)) {
    log.warn({ sheetPath }, "showcase sample files not found; demo store starts empty");
    return;
  }
  const result = await acceptUpload(db, {
    storeId: store.id,
    sheet: { name: "new-12.csv", data: readFileSync(sheetPath) },
    photos: [{ name: "photos-new-12.zip", data: readFileSync(photosPath) }],
    mode: "fast",
    name: "Showcase catalogue (new-12.csv)",
    autoPublish: true,
  });
  log.info({ importId: result.importId }, "showcase import queued for the demo store");
}
