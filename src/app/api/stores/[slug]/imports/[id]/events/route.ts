import { getDb } from "@/db/client";
import { getImport, listImportEvents } from "@/db/repositories/imports";
import { getBus, type ImportLogEvent, type ImportProgressEvent } from "@/lib/events";
import { HttpError, parseIntParam, withApi } from "@/lib/http";
import { requireStore } from "@/lib/session";
import { serializeImport } from "@/lib/serializers";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; id: string }> };

const POLL_MS = 3_000;
const HEARTBEAT_MS = 15_000;

/**
 * Server-sent events: progress and log lines for one import. Fed by the in-process bus when the
 * worker is embedded, and by polling the database otherwise, so it works in both modes.
 */
export const GET = withApi(async (req: Request, { params }: Ctx) => {
  const { slug, id } = await params;
  const { store } = await requireStore(slug);
  const db = getDb();
  const imp = await getImport(db, store.id, id);
  if (!imp) throw new HttpError(404, "import_not_found", "Import not found");
  let lastEventId = parseIntParam(new URL(req.url).searchParams.get("after"), 0, 0, Number.MAX_SAFE_INTEGER);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown): void => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const bus = getBus();
      const onProgress = (e: ImportProgressEvent): void => {
        if (e.importId === id) send("progress", e);
      };
      const onLog = (e: ImportLogEvent): void => {
        if (e.importId === id && e.id > lastEventId) {
          lastEventId = e.id;
          send("log", e);
        }
      };
      bus.on("import:progress", onProgress);
      bus.on("import:log", onLog);

      let closed = false;
      const poll = async (): Promise<void> => {
        if (closed) return;
        try {
          const current = await getImport(db, store.id, id);
          if (current) {
            send("progress", {
              importId: id,
              storeId: store.id,
              status: current.status,
              counts: current.counts,
              totalRows: current.totalRows,
              productCount: current.productCount,
              pausedUntil: current.pausedUntil?.toISOString() ?? null,
              pauseReason: current.pauseReason,
              import: serializeImport(current),
            });
            const events = await listImportEvents(db, id, lastEventId, 100);
            for (const e of events) {
              lastEventId = e.id;
              send("log", { importId: id, id: e.id, level: e.level, message: e.message, data: e.data ?? undefined, createdAt: e.createdAt.toISOString() });
            }
          }
        } catch {
          // transient DB error: keep the stream open, the next poll will retry
        }
      };
      void poll();
      const pollTimer = setInterval(() => void poll(), POLL_MS);
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(": keep-alive\n\n")), HEARTBEAT_MS);

      const cleanup = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(pollTimer);
        clearInterval(heartbeat);
        bus.off("import:progress", onProgress);
        bus.off("import:log", onLog);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      req.signal.addEventListener("abort", cleanup, { once: true });
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
});
