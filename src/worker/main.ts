import "@/lib/env";
import { getLogger } from "@/lib/logger";
import { ensureWorkerStarted, stopWorker } from "./start";

/**
 * Standalone worker process (`npm run worker`, docker-compose `worker` service).
 * Exits on SIGTERM/SIGINT after draining in-flight jobs for up to 30 s.
 */
const log = getLogger({ component: "worker-main" });

process.env.WORKER_MODE = "separate";

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info({ signal }, "shutting down");
  try {
    await stopWorker(30_000);
    process.exit(0);
  } catch (err) {
    log.error({ err }, "shutdown failed");
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  log.error({ err: reason }, "unhandled rejection");
});

ensureWorkerStarted().catch((err: unknown) => {
  log.error({ err }, "worker failed to start");
  process.exit(1);
});
