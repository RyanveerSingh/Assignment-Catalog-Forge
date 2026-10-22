import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { stores, users } from "@/db/schema";
import { createStore, registerUser } from "./auth";
import { getLogger } from "./logger";

export const DEMO_EMAIL = "demo@catalogforge.dev";
export const DEMO_PASSWORD = "demo1234";

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
