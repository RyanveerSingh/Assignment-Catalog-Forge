"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BanIcon, CheckIcon, CircleXIcon, CoinsIcon, EyeIcon, LayersIcon, PackageIcon, PauseIcon, TriangleAlertIcon } from "lucide-react";
import { AnimatePresence } from "motion/react";
import type { HygieneReport } from "@/core/metrics/hygiene";
import type { ImportLogEvent, ImportProgressEvent } from "@/lib/events";
import { Reveal } from "@/components/ext/reveal";
import { StatTile } from "@/components/ext/stat-tile";
import { Button } from "@/components/ui/button";
import { api, ApiError, storeApi } from "@/lib/client/api";
import { formatCountdown, formatMicrosUsd, formatNumber, formatPercent } from "@/lib/format";
import { HygienePipeline } from "./hygiene-pipeline";
import { type ImportAction, ImportHeader } from "./import-header";
import { EventLog, MAX_EVENTS } from "./import-live-events";
import { RowsProgress } from "./import-live-progress";
import { SheetCard } from "./import-live-sheet";
import { Banner, type Connection } from "./import-live-status";
import { LiveStageStepper } from "./import-live-stepper";
import type { ImportDto, ImportEventDto } from "./import-live-types";
import { RowsTable } from "./rows-table";
import { isImportActive, SIDE_STATES, stepIndexFor } from "./stage-stepper";

export type { ImportDto, ImportEventDto } from "./import-live-types";

type ProgressPayload = ImportProgressEvent & { import?: ImportDto };

const MAX_BACKOFF_MS = 10_000;

/** "41% of rows" for a tile, or where the count comes from while the total is still unknown. */
function shareOfRows(n: number, total: number): string {
  return total > 0 ? `${formatPercent(n / total)} of rows` : "waiting for the row count";
}

function isImportStatus(s: string): s is ImportDto["status"] {
  return stepIndexFor(s) >= 0 || SIDE_STATES.has(s);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isProgress(v: unknown): v is ProgressPayload {
  return typeof v === "object" && v !== null && "status" in v && "counts" in v;
}

function isLog(v: unknown): v is ImportLogEvent {
  return typeof v === "object" && v !== null && "id" in v && "message" in v;
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function ImportLive({ storeSlug, initialImport, initialEvents, initialHygiene = null }: { storeSlug: string; initialImport: ImportDto; initialEvents: ImportEventDto[]; initialHygiene?: HygieneReport | null }) {
  const id = initialImport.id;
  const detailUrl = `${storeApi(storeSlug)}/imports/${encodeURIComponent(id)}`;
  const [imp, setImp] = useState(initialImport);
  const [events, setEvents] = useState<ImportEventDto[]>(() => [...initialEvents].sort((a, b) => b.id - a.id).slice(0, MAX_EVENTS));
  const lastIdRef = useRef(initialEvents.reduce((m, e) => Math.max(m, e.id), 0));
  const [lastStage, setLastStage] = useState<string | null>(() => (stepIndexFor(initialImport.status) >= 0 ? initialImport.status : null));
  const [conn, setConn] = useState<Connection>("connecting");
  const [busy, setBusy] = useState<ImportAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const live = isImportActive(imp.status);
  const now = useNow(live ? 1_000 : 30_000);

  const pushEvents = useCallback((incoming: ImportEventDto[]) => {
    for (const e of incoming) lastIdRef.current = Math.max(lastIdRef.current, e.id);
    setEvents((prev) => {
      const seen = new Set(prev.map((e) => e.id));
      const fresh = incoming.filter((e) => !seen.has(e.id));
      if (fresh.length === 0) return prev;
      return [...fresh, ...prev].sort((a, b) => b.id - a.id).slice(0, MAX_EVENTS);
    });
  }, []);

  const applyImport = useCallback((next: ImportDto) => {
    setImp(next);
    if (stepIndexFor(next.status) >= 0) setLastStage(next.status);
  }, []);

  const applyProgress = useCallback(
    (p: ProgressPayload) => {
      if (p.import) {
        applyImport(p.import);
        return;
      }
      if (stepIndexFor(p.status) >= 0) setLastStage(p.status);
      setImp((prev) => ({
        ...prev,
        status: isImportStatus(p.status) ? p.status : prev.status,
        counts: p.counts,
        totalRows: p.totalRows,
        productCount: p.productCount,
        pausedUntil: p.pausedUntil,
        pauseReason: p.pauseReason,
      }));
    },
    [applyImport],
  );

  // Manual reconnect with ?after= so a dropped connection neither replays nor loses log lines.
  useEffect(() => {
    if (!live) return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let stopped = false;
    const connect = (): void => {
      setConn(attempt === 0 ? "connecting" : "reconnecting");
      es = new EventSource(`${detailUrl}/events?after=${lastIdRef.current}`);
      es.onopen = () => {
        attempt = 0;
        setConn("live");
      };
      es.addEventListener("progress", (e) => {
        if (!(e instanceof MessageEvent) || typeof e.data !== "string") return;
        const p = parseJson(e.data);
        if (isProgress(p)) applyProgress(p);
      });
      es.addEventListener("log", (e) => {
        if (!(e instanceof MessageEvent) || typeof e.data !== "string") return;
        const l = parseJson(e.data);
        if (isLog(l)) pushEvents([{ id: l.id, level: l.level, message: l.message, data: l.data ?? null, createdAt: l.createdAt }]);
      });
      es.onerror = () => {
        es?.close();
        if (stopped) return;
        const delay = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** attempt);
        attempt += 1;
        setConn("reconnecting");
        timer = setTimeout(connect, delay);
      };
    };
    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [live, detailUrl, applyProgress, pushEvents]);

  // The stream closes on a terminal status; one GET picks up log lines written in that same tick.
  const wasLiveRef = useRef(live);
  useEffect(() => {
    const wasLive = wasLiveRef.current;
    wasLiveRef.current = live;
    if (!wasLive || live) return;
    void api<{ import: ImportDto; events: ImportEventDto[] }>(`${detailUrl}?eventsAfter=${lastIdRef.current}`)
      .then((r) => {
        applyImport(r.import);
        pushEvents(r.events);
      })
      .catch(() => undefined); // a missed tail of the log is not worth a banner
  }, [live, detailUrl, applyImport, pushEvents]);

  const runAction = async (action: ImportAction): Promise<void> => {
    setBusy(action);
    setActionError(null);
    try {
      const r = await api<{ import: ImportDto | null }>(detailUrl, { method: "POST", json: { action } });
      if (r.import) applyImport(r.import);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "The action did not reach the server; try again");
    } finally {
      setBusy(null);
      setConfirmCancel(false);
    }
  };

  const { counts, totalRows } = imp;
  const finished = counts.done + counts.needs_review + counts.failed;
  const fraction = totalRows > 0 ? Math.min(1, finished / totalRows) : 0;
  const startedMs = imp.startedAt ? Date.parse(imp.startedAt) : null;
  const elapsedMs = startedMs !== null ? Math.max(0, (imp.finishedAt ? Date.parse(imp.finishedAt) : now) - startedMs) : null;
  const rowsPerMin = live && elapsedMs !== null && elapsedMs > 10_000 && finished > 0 ? Math.round(finished / (elapsedMs / 60_000)) : null;
  const countdown = imp.status === "paused" ? formatCountdown(imp.pausedUntil, now) : null;
  const saved = imp.costSummary && imp.costSummary.savedMicros > 0 ? imp.costSummary.savedMicros : null;
  const canResume = imp.status === "paused";

  return (
    <div className="flex flex-col gap-5">
      <Reveal>
        <ImportHeader storeSlug={storeSlug} imp={imp} now={now} elapsedMs={elapsedMs} live={live} conn={conn} busy={busy} confirmCancel={confirmCancel} actionError={actionError} onConfirmCancel={setConfirmCancel} onAction={(a) => void runAction(a)} />
      </Reveal>

      {/* A banner that is already there on page load renders settled; one that arrives while watching slides in. */}
      <AnimatePresence initial={false}>
        {imp.status === "paused" ? (
          <Banner key="paused" tone="warning" icon={PauseIcon} action={canResume ? <Button size="sm" className="cursor-pointer rounded-full" disabled={busy !== null} onClick={() => void runAction("resume")}>Resume now</Button> : null}>
            <strong className="font-medium">Paused</strong>
            {countdown === null ? (imp.pauseReason ? ` — ${imp.pauseReason}` : "") : countdown === "now" ? " — resuming now" : ` — resuming in ${countdown}`}
            <span className="block text-xs text-ink-muted" suppressHydrationWarning>
              {countdown === null ? "Waiting for you to resume" : (imp.pauseReason ?? "Resumes automatically")}
            </span>
          </Banner>
        ) : null}
        {imp.status === "needs_attention" ? (
          <Banner key="attention" tone="warning" icon={TriangleAlertIcon}>
            <strong className="font-medium">Needs attention</strong> — {imp.error ?? "some rows could not be finished; check the event log below, then retry"}
          </Banner>
        ) : null}
        {imp.status === "failed" ? (
          <Banner key="failed" tone="danger" icon={TriangleAlertIcon}>
            <strong className="font-medium">Failed</strong> — {imp.error ?? "the event log below says why"}
          </Banner>
        ) : null}
        {imp.status === "cancelled" ? (
          <Banner key="cancelled" tone="neutral" icon={BanIcon}>
            <strong className="font-medium">Cancelled</strong>
            {imp.error ? ` — ${imp.error}` : ""}
          </Banner>
        ) : null}
      </AnimatePresence>

      <Reveal index={1}>
        <LiveStageStepper status={imp.status} lastStage={lastStage} />
      </Reveal>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
        <StatTile index={2} label="Total rows" value={totalRows} format={formatNumber} icon={LayersIcon} context={totalRows > 0 ? `${formatNumber(finished)} finished` : "counting the sheet"} />
        <StatTile index={3} label="Done" value={counts.done} format={formatNumber} icon={CheckIcon} tone="success" context={shareOfRows(counts.done, totalRows)} />
        <StatTile index={4} label="Needs review" value={counts.needs_review} format={formatNumber} icon={EyeIcon} tone="warning" context={shareOfRows(counts.needs_review, totalRows)} contextTone={counts.needs_review > 0 ? "warning" : "muted"} />
        <StatTile index={5} label="Failed" value={counts.failed} format={formatNumber} icon={CircleXIcon} tone="danger" context={shareOfRows(counts.failed, totalRows)} contextTone={counts.failed > 0 ? "danger" : "muted"} />
        <StatTile index={6} label="Products" value={imp.productCount} format={formatNumber} icon={PackageIcon} tone="info" context={imp.productCount > 0 ? `about ${(totalRows / imp.productCount).toFixed(1)} rows each` : "grouped once rows are clean"} />
        <StatTile
          index={7}
          label="Cost so far"
          value={imp.costMicros}
          format={formatMicrosUsd}
          icon={CoinsIcon}
          tone="brand"
          context={
            <>
              {saved !== null ? (
                <span className="text-success" title="Compared with paying list price for every call: no caching, batching or cheaper models">
                  saved {formatMicrosUsd(saved)} vs list ·{" "}
                </span>
              ) : null}
              budget ${(imp.budgetCents / 100).toFixed(2)}
            </>
          }
        />
      </div>

      <Reveal index={4}>
        <RowsProgress counts={counts} totalRows={totalRows} finished={finished} fraction={fraction} rowsPerMin={rowsPerMin} />
      </Reveal>

      <HygienePipeline storeSlug={storeSlug} importId={id} status={imp.status} active={live} initial={initialHygiene} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Reveal index={5} className="flex min-w-0">
          <SheetCard imp={imp} />
        </Reveal>
        <Reveal index={6} className="flex min-w-0">
          <EventLog events={events} live={live} />
        </Reveal>
      </div>

      <RowsTable storeSlug={storeSlug} importId={id} counts={counts} totalRows={totalRows} />
    </div>
  );
}
