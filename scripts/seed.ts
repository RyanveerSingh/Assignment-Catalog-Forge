import "../src/lib/env";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { stores, users } from "../src/db/schema";
import { createStore, registerUser } from "../src/lib/auth";

/**
 * Demo accounts for the live demo and local development. Idempotent.
 *   demo@catalogforge.dev / demo1234  → stores "Demo Store" (demo) and "Second Store" (second)
 * The second store exists to show that data never leaks between stores (EC-I1).
 */
async function main(): Promise<void> {
  await runMigrations();
  const db = getDb();
  const email = "demo@catalogforge.dev";
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  let userId = existing?.id;
  if (!userId) {
    const user = await registerUser(db, { email, password: "demo1234", name: "Demo Merchant" });
    userId = user.id;
    console.log(`created user ${email}`);
  }
  for (const s of [
    { name: "Demo Store", slug: "demo", defaultCurrency: "EUR" },
    { name: "Second Store", slug: "second", defaultCurrency: "GBP" },
  ]) {
    const [found] = await db.select({ id: stores.id }).from(stores).where(eq(stores.slug, s.slug)).limit(1);
    if (!found) {
      await createStore(db, userId, s);
      console.log(`created store ${s.slug}`);
    }
  }
  console.log("seed complete: demo@catalogforge.dev / demo1234");
}

main()
  .then(() => closeDb())
  .catch(async (err: unknown) => {
    console.error(err);
    await closeDb();
    process.exitCode = 1;
  });
