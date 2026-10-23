import { getConfig } from "@/lib/config";
import { HttpError, json, withApi } from "@/lib/http";
import { getLogger } from "@/lib/logger";
import { currentUser } from "@/lib/session";
import { crashWorker } from "@/worker/start";

/**
 * "Crash worker now". With the worker embedded in this process (the free-tier deployment) the
 * worker alone is crashed and restarted: its in-flight jobs lose their leases, the reaper reclaims
 * them, and the import resumes with nothing lost or doubled (EC-E1, E16), while the storefront and
 * the dashboard keep serving. Exiting the whole process would prove the same thing at the cost of a
 * host cold start and a minute of 502s, which is the opposite of "storefront stays fast".
 */
export const POST = withApi(async () => {
  if (!(await currentUser())) throw new HttpError(401, "unauthenticated", "Sign in to continue");
  if (getConfig().WORKER_MODE !== "embedded") {
    throw new HttpError(409, "worker_not_embedded", "The worker runs as a separate process here; stop that process to simulate a crash");
  }
  const result = crashWorker();
  if (!result) throw new HttpError(409, "worker_not_running", "No embedded worker is running in this process");
  getLogger({ component: "chaos" }).error({ dropped: result.dropped }, "worker crashed from the dashboard; restarting in 2 s");
  return json({
    ok: true,
    dropped: result.dropped,
    message:
      result.dropped > 0
        ? `Worker crashed with ${result.dropped} job(s) mid-flight; their leases expire and the reaper hands them to the new worker starting in 2 s. The web server never stopped.`
        : "Worker crashed (it was idle); a new worker starts in 2 s. The web server never stopped.",
  });
});
