import { HttpError, json, withApi } from "@/lib/http";
import { getLogger } from "@/lib/logger";
import { currentUser } from "@/lib/session";

/**
 * "Crash worker now": exits the process with a non-zero code so the host restarts it, proving that
 * an import resumes with nothing lost or doubled (EC-E1, E16). In embedded mode this is also the web
 * process; the dashboard reconnects on its own.
 */
export const POST = withApi(async () => {
  if (!(await currentUser())) throw new HttpError(401, "unauthenticated", "Sign in to continue");
  getLogger({ component: "chaos" }).error("crash requested from the dashboard; exiting in 500 ms");
  setTimeout(() => process.exit(1), 500);
  return json({ ok: true, message: "Process will exit in 0.5 s; the host restarts it and the import resumes" });
});
