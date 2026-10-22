import { getDb } from "@/db/client";
import { appendImportEvent, getImport, listImportEvents, pauseImport, recomputeImportCounts, resumeImport, transitionImport, updateImport } from "@/db/repositories/imports";
import { failOpenRows } from "@/db/repositories/rows";
import { requestDrive } from "@/jobs/drive";
import { HttpError, json, parseIntParam, withApi } from "@/lib/http";
import { requireStore } from "@/lib/session";
import { ACTIVE_IMPORT_STATUSES } from "@/db/schema";
import { serializeImport } from "../route";

type Ctx = { params: Promise<{ slug: string; id: string }> };

export const GET = withApi(async (req: Request, { params }: Ctx) => {
  const { slug, id } = await params;
  const { store } = await requireStore(slug);
  const db = getDb();
  const imp = await getImport(db, store.id, id);
  if (!imp) throw new HttpError(404, "import_not_found", "Import not found");
  const url = new URL(req.url);
  const after = parseIntParam(url.searchParams.get("eventsAfter"), 0, 0, Number.MAX_SAFE_INTEGER);
  const events = await listImportEvents(db, id, after, 200);
  return json({ import: serializeImport(imp), events: events.map((e) => ({ id: e.id, level: e.level, message: e.message, data: e.data, createdAt: e.createdAt.toISOString() })) });
});

/** Actions: pause, resume, cancel, retry (re-drive). */
export const POST = withApi(async (req: Request, { params }: Ctx) => {
  const { slug, id } = await params;
  const { store, user } = await requireStore(slug);
  const db = getDb();
  const imp = await getImport(db, store.id, id);
  if (!imp) throw new HttpError(404, "import_not_found", "Import not found");
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  switch (body.action) {
    case "pause":
      if (!ACTIVE_IMPORT_STATUSES.includes(imp.status) || imp.status === "paused") throw new HttpError(409, "not_pausable", `Import is ${imp.status}`);
      await pauseImport(db, id, null, `Paused by ${user.name}`);
      break;
    case "resume":
      if (imp.status !== "paused") throw new HttpError(409, "not_paused", `Import is ${imp.status}`);
      await resumeImport(db, id);
      await requestDrive(db, id, store.id);
      break;
    case "cancel": {
      if (!ACTIVE_IMPORT_STATUSES.includes(imp.status)) throw new HttpError(409, "not_cancellable", `Import is ${imp.status}`);
      const closed = await failOpenRows(db, id, "Cancelled by user");
      await transitionImport(db, id, [...ACTIVE_IMPORT_STATUSES], "cancelled", { finishedAt: new Date(), pausedUntil: null, pauseReason: null });
      await recomputeImportCounts(db, id);
      await appendImportEvent(db, id, "warn", `Cancelled by ${user.name}; ${closed} open row(s) marked Failed`);
      break;
    }
    case "retry":
      // Re-drive: completed/needs_attention/failed imports can be pushed through again; the driver re-enqueues only what is missing.
      if (imp.status === "needs_attention" || imp.status === "failed") {
        await updateImport(db, id, { status: "queued", error: null, finishedAt: null });
        await appendImportEvent(db, id, "info", `Retry requested by ${user.name}`);
      }
      await requestDrive(db, id, store.id);
      break;
    default:
      throw new HttpError(400, "unknown_action", "action must be pause, resume, cancel or retry");
  }
  const updated = await getImport(db, store.id, id);
  return json({ import: updated ? serializeImport(updated) : null });
});
