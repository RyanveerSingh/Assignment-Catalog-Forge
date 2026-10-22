/**
 * Next.js instrumentation hook. In the free deployment the worker runs inside the web process
 * (`WORKER_MODE=embedded`); locally and on paid hosts it runs separately and this does nothing.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.WORKER_MODE !== "embedded") return;
  const { ensureWorkerStarted, stopWorker } = await import("@/worker/start");
  await ensureWorkerStarted();
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      void stopWorker(30_000).finally(() => process.exit(0));
    });
  }
}
