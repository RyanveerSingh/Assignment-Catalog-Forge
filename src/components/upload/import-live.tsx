"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, BanIcon, PauseIcon, PlayIcon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import type { HygieneReport } from "@/core/metrics/hygiene";
import type { ImportLogEvent, ImportProgressEvent } from "@/lib/events";
import { Kpi } from "@/components/ext/kpi";
import { StatusBadge } from "@/components/ext/status-badge";
import { Button } from "@/components/ui/button";
import { api, ApiError, storeApi } from "@/lib/client/api";
import { formatCountdown, formatDuration, formatMicrosUsd, formatNumber, formatPercent, statusLabel } from "@/lib/format";
import { HygienePipeline } from "./hygiene-pipeline";
import { EventLog, MAX_EVENTS } from "./import-live-events";
import { SheetCard } from "./import-live-sheet";
import { Banner, ConnBadge, type Connection, Stamp } from "./import-live-status";
import type { ImportDto, ImportEventDto } from "./import-live-types";
import { RowsTable } from "./rows-table";
import { isImportActive, SIDE_STATES, StageStepper, stepIndexFor } from "./stage-stepper";

export type { ImportDto, ImportEventDto } from "./import-live-types";

type ProgressPayload = ImportProgressEvent & { import?: ImportDto };
type Action = "pause" | "resume" | "cancel" | "retry";

const MAX_BACKOFF_MS = 10_000;
const COUNT_KEYS = ["pending", "processing", "done", "needs_review", "failed"] as const;

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
  const [busy, setBusy] = useState<Action | null>(null);
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

  const runAction = async (action: Action): Promise<void> => {
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
  const canPause = live && imp.status !== "paused";
  const canResume = imp.status === "paused";
  const canRetry = imp.status === "failed" || imp.status === "needs_attention";
  const brandButton = "cursor-pointer bg-brand text-brand-foreground hover:bg-brand/90";

  return (
    <div className="flex flex-col gap-6">
      <header className="border-b border-border pb-4">
        <Link
          href={`/app/${storeSlug}/upload`}
          className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-xs text-ink-muted transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
        >
          <ArrowLeftIcon className="size-3.5" aria-hidden /> All imports
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-brand">Import</div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display max-w-full min-w-0 truncate text-2xl leading-tight text-ink md:text-3xl">{imp.name}</h1>
              <StatusBadge status={imp.status} />
              <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-ink-muted">{imp.mode === "economy" ? "Economy · batch" : "Fast · realtime"}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
              <span>
                Created <Stamp iso={imp.createdAt} now={now} />
              </span>
              {imp.startedAt ? (
                <span>
                  Started <Stamp iso={imp.startedAt} now={now} />
                </span>
              ) : null}
              {imp.finishedAt ? (
                <span>
                  Finished <Stamp iso={imp.finishedAt} now={now} />
                </span>
              ) : null}
              {elapsedMs !== null ? (
                <span className="num" suppressHydrationWarning>
                  {formatDuration(elapsedMs)}
                  {imp.finishedAt ? "" : " so far"}
                </span>
              ) : null}
              <ConnBadge live={live} conn={conn} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canPause ? (
              <Button variant="outline" size="sm" className="cursor-pointer" disabled={busy !== null} onClick={() => void runAction("pause")}>
                <PauseIcon data-icon="inline-start" aria-hidden /> Pause
              </Button>
            ) : null}
            {canResume ? (
              <Button size="sm" className={brandButton} disabled={busy !== null} onClick={() => void runAction("resume")}>
                <PlayIcon data-icon="inline-start" aria-hidden /> Resume
              </Button>
            ) : null}
            {canRetry ? (
              <Button size="sm" className={brandButton} disabled={busy !== null} onClick={() => void runAction("retry")}>
                <RotateCcwIcon data-icon="inline-start" aria-hidden /> Retry
              </Button>
            ) : null}
            {live && !confirmCancel ? (
              <Button variant="outline" size="sm" className="cursor-pointer text-destructive hover:text-destructive" disabled={busy !== null} onClick={() => setConfirmCancel(true)}>
                <BanIcon data-icon="inline-start" aria-hidden /> Cancel
              </Button>
            ) : null}
            {live && confirmCancel ? (
              <div role="group" aria-label="Confirm cancel" className="flex flex-wrap items-center gap-2 border-l-[3px] border-destructive bg-destructive/5 px-2 py-1 text-xs text-ink">
                <span>Cancel this import? Open rows are marked failed.</span>
                <Button variant="destructive" size="sm" className="cursor-pointer" disabled={busy !== null} onClick={() => void runAction("cancel")}>
                  Yes, cancel
                </Button>
                <Button variant="ghost" size="sm" className="cursor-pointer" disabled={busy !== null} onClick={() => setConfirmCancel(false)}>
                  Keep running
                </Button>
              </div>
            ) : null}
          </div>
        </div>
        {actionError ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {actionError}
          </p>
        ) : null}
      </header>

      {imp.status === "paused" ? (
        <Banner tone="warning" icon={PauseIcon} action={canResume ? <Button size="sm" className={brandButton} disabled={busy !== null} onClick={() => void runAction("resume")}>Resume now</Button> : null}>
          <strong className="font-medium">Paused</strong>
          {countdown === null ? (imp.pauseReason ? ` — ${imp.pauseReason}` : "") : countdown === "now" ? " — resuming now" : ` — resuming in ${countdown}`}
          <span className="block text-xs text-ink-muted" suppressHydrationWarning>
            {countdown === null ? "Waiting for you to resume" : (imp.pauseReason ?? "Resumes automatically")}
          </span>
        </Banner>
      ) : null}
      {imp.status === "needs_attention" ? (
        <Banner tone="warning" icon={TriangleAlertIcon}>
          <strong className="font-medium">Needs attention</strong> — {imp.error ?? "some rows could not be finished; review the log and retry"}
        </Banner>
      ) : null}
      {imp.status === "failed" ? (
        <Banner tone="danger" icon={TriangleAlertIcon}>
          <strong className="font-medium">Failed</strong> — {imp.error ?? "see the event log for the cause"}
        </Banner>
      ) : null}
      {imp.status === "cancelled" ? (
        <Banner tone="neutral" icon={BanIcon}>
          <strong className="font-medium">Cancelled</strong>
          {imp.error ? ` — ${imp.error}` : ""}
        </Banner>
      ) : null}

      <StageStepper status={imp.status} lastStage={lastStage} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Total rows" value={formatNumber(totalRows)} />
        <Kpi label="Done" tone="success" value={formatNumber(counts.done)} />
        <Kpi label="Needs review" tone="warning" value={formatNumber(counts.needs_review)} />
        <Kpi label="Failed" tone="danger" value={formatNumber(counts.failed)} />
        <Kpi label="Products" value={formatNumber(imp.productCount)} />
        <Kpi
          label="Cost so far"
          tone="brand"
          value={formatMicrosUsd(imp.costMicros)}
          hint={
            <>
              {saved !== null ? <span className="text-success">saved {formatMicrosUsd(saved)} vs naive · </span> : null}
              budget ${(imp.budgetCents / 100).toFixed(2)}
            </>
          }
        />
      </div>

      <section aria-label="Row progress" className="bg-card px-4 py-3 hairline">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
          <span className="font-medium text-ink">Rows processed</span>
          <span className="num text-ink-muted" suppressHydrationWarning>
            {formatNumber(finished)} / {formatNumber(totalRows)} · {formatPercent(fraction)}
            {rowsPerMin !== null ? ` · ${formatNumber(rowsPerMin)} rows/min` : ""}
          </span>
        </div>
        <div role="progressbar" aria-label="Rows processed" aria-valuemin={0} aria-valuemax={Math.max(1, totalRows)} aria-valuenow={finished} className="mt-2 h-1.5 w-full bg-paper-deep">
          <div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${fraction * 100}%` }} />
        </div>
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-muted">
          {COUNT_KEYS.map((k) => (
            <div key={k} className="flex gap-1">
              <dt>{statusLabel(k)}</dt>
              <dd className="num text-ink">{formatNumber(counts[k])}</dd>
            </div>
          ))}
        </dl>
      </section>

      <HygienePipeline storeSlug={storeSlug} importId={id} status={imp.status} active={live} initial={initialHygiene} />

      <div className="grid gap-6 lg:grid-cols-2">
        <SheetCard imp={imp} />
        <EventLog events={events} />
      </div>

      <RowsTable storeSlug={storeSlug} importId={id} counts={counts} totalRows={totalRows} />
    </div>
  );
}
