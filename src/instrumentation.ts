/**
 * Next.js instrumentation hook. Runs migrations, seeds the demo accounts when asked, and in the
 * free deployment starts the worker inside the web process (`WORKER_MODE=embedded`).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getDb } = await import("@/db/client");
  const { runMigrations } = await import("@/db/migrate");
  const { getLogger } = await import("@/lib/logger");
  const log = getLogger({ component: "boot" });
  try {
    await runMigrations();
    if (process.env.SEED_DEMO === "true") {
      const { seedDemo, seedShowcase } = await import("@/lib/seed");
      await seedDemo(getDb());
      await seedShowcase(getDb());
    }
  } catch (err) {
    log.error({ err }, "boot migration/seed failed; continuing so /api/health can report it");
  }
  if (process.env.WORKER_MODE !== "embedded") return;
  const { ensureWorkerStarted, stopWorker } = await import("@/worker/start");
  await ensureWorkerStarted();
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void stopWorker(30_000).finally(() => process.exit(0));
    });
  }
}
