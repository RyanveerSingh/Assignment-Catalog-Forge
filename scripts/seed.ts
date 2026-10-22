import "../src/lib/env";
import { closeDb, getDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from "../src/lib/seed";

async function main(): Promise<void> {
  await runMigrations();
  await seedDemo(getDb());
  console.log(`seed complete: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .then(() => closeDb())
  .catch(async (err: unknown) => {
    console.error(err);
    await closeDb();
    process.exitCode = 1;
  });
