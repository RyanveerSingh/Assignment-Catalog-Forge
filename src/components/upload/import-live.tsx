"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon, BanIcon, type LucideIcon, PauseIcon, PlayIcon, RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "cn";
import type { serializeImport } from "@/lib/serializers";
import type { ColumnMapping, Issue } from "@/core/types";
import type { ImportLogEvent, ImportProgressEvent } from "@/lib/events";
import { ConfidenceChip } from "@/components/ext/confidence-chip";
import { Kpi } from "@/components/ext/kpi";
import { StatusBadge } from "@/components/ext/status-badge";
import { Button } from "@/components/ui/button";
import { api, ApiError, storeApi } from "@/lib/client/api";
import { formatCountdown, formatDuration, formatMicrosUsd, formatNumber, formatPercent, formatRelative, statusLabel } from "@/lib/format";
import { RowsTable } from "./rows-table";
import { isImportActive, SIDE_STATES, StageStepper, stepIndexFor } from "./stage-stepper";

/** Exactly what the imports API returns; the pages serialize with the same function, so UI and API cannot drift. */
export type ImportDto = ReturnType<typeof serializeImport>;

export interface ImportEventDto {
  id: number;
  level: "info" | "warn" | "error";
  message: string;
  data: Record<string, unknown> | null;
  createdAt: string;
}

type ProgressPayload = ImportProgressEvent & { import?: ImportDto };
type Action = "pause" | "resume" | "cancel" | "retry";
type Connection = "connecting" | "live" | "reconnecting";

const MAX_EVENTS = 500;
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

export function ImportLive({ storeSlug, initialImport, initialEvents }: { storeSlug: string; initialImport: ImportDto; initialEvents: ImportEventDto[] }) {
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
          {imp.pauseReason ? ` — ${imp.pauseReason}` : ""}
          <span className="block text-xs text-ink-muted" suppressHydrationWarning>
            {countdown === null ? "Waiting for you to resume" : countdown === "now" ? "Resuming now" : `Resumes automatically in ${countdown}`}
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

      <div className="grid gap-6 lg:grid-cols-2">
        <SheetCard imp={imp} />
        <EventLog events={events} />
      </div>

      <RowsTable storeSlug={storeSlug} importId={id} counts={counts} totalRows={totalRows} />
    </div>
  );
}

function Stamp({ iso, now }: { iso: string; now: number }) {
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString("en-GB")} suppressHydrationWarning>
      {formatRelative(iso, now)}
    </time>
  );
}

function ConnBadge({ live, conn }: { live: boolean; conn: Connection }) {
  if (!live) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 rounded-full bg-ink/30" />
        Final
      </span>
    );
  }
  const label = conn === "live" ? "Live" : conn === "reconnecting" ? "Reconnecting…" : "Connecting…";
  return (
    <span className="inline-flex items-center gap-1.5" role="status">
      <span aria-hidden className={cn("size-1.5 rounded-full", conn === "live" ? "animate-pulse bg-success" : "bg-warning")} />
      {label}
    </span>
  );
}

const BANNER_CLASS = {
  warning: ["border-warning bg-warning-soft", "text-warning"],
  danger: ["border-destructive bg-destructive/5", "text-destructive"],
  neutral: ["border-border bg-muted", "text-ink-muted"],
} as const;

function Banner({ tone, icon: Icon, children, action }: { tone: keyof typeof BANNER_CLASS; icon: LucideIcon; children: React.ReactNode; action?: React.ReactNode }) {
  const [box, iconColor] = BANNER_CLASS[tone];
  return (
    <div role="status" className={cn("flex flex-wrap items-center gap-3 border-l-[3px] px-3 py-2 text-sm text-ink", box)}>
      <Icon className={cn("size-4 shrink-0", iconColor)} aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

function isColumnMapping(v: unknown): v is ColumnMapping {
  if (typeof v !== "object" || v === null) return false;
  const o: Record<string, unknown> = { ...v };
  return typeof o.header === "string" && typeof o.originalHeader === "string" && typeof o.index === "number" && typeof o.confidence === "number" && (o.canonical === null || typeof o.canonical === "string");
}

function describeDelimiter(d: string | undefined): string | null {
  if (d === undefined) return null;
  if (d === "\t") return "tab";
  if (d === ";") return "; semicolon";
  if (d === ",") return ", comma";
  if (d === "|") return "| pipe";
  return d;
}

function SheetCard({ imp }: { imp: ImportDto }) {
  const meta = imp.parseMeta;
  const mappings = (imp.columnMap ?? []).filter(isColumnMapping);
  // ingest.ts writes a few fields beyond the declared ImportParseMeta shape; read them defensively.
  const extra: Record<string, unknown> = meta ? { ...meta } : {};
  const totalInFile = typeof extra.totalRowsInFile === "number" ? extra.totalRowsInFile : null;
  const mappedCount = typeof extra.mappedCount === "number" ? extra.mappedCount : mappings.filter((m) => m.canonical !== null).length;
  const priceLocale = typeof extra.priceLocale === "string" ? extra.priceLocale : null;
  const truncated = extra.truncated === true;
  const issues = meta?.issues ?? [];
  return (
    <section aria-labelledby="sheet-heading" className="bg-card hairline">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h2 id="sheet-heading" className="font-display text-lg text-ink">
          Sheet
        </h2>
        {meta?.format ? <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-ink-muted">{meta.format}</span> : null}
      </div>
      {!meta ? (
        <p className="px-4 py-6 text-sm text-ink-muted">Not parsed yet.</p>
      ) : (
        <div className="flex flex-col gap-4 px-4 py-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <Fact label="Encoding" value={meta.encoding} />
            <Fact label="Delimiter" value={describeDelimiter(meta.delimiter)} />
            <Fact label="Sheet" value={meta.sheetName} />
            <Fact label="Header row" value={meta.headerRowIndex !== undefined ? `row ${meta.headerRowIndex + 1}` : null} />
            <Fact label="Rows in file" value={totalInFile !== null ? formatNumber(totalInFile) : null} warn={truncated ? `cut to ${formatNumber(imp.totalRows)}` : undefined} />
            <Fact label="Mapped columns" value={`${mappedCount} of ${mappings.length || meta.headers?.length || 0}`} />
            {priceLocale ? <Fact label="Price locale" value={priceLocale} /> : null}
          </dl>
          {mappings.length > 0 ? (
            <div>
              <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-muted">Column mapping</h3>
              <ul className="flex flex-wrap gap-1.5">
                {mappings.map((m) => (
                  <li key={m.index} className={cn("flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-xs ring-1 ring-inset", m.canonical ? "bg-card text-ink ring-border" : "bg-muted text-ink-muted ring-transparent")}>
                    <span className="num max-w-[160px] truncate" title={m.originalHeader}>
                      {m.originalHeader || "(blank)"}
                    </span>
                    <span aria-hidden>→</span>
                    <span className="sr-only">maps to</span>
                    {m.canonical ? (
                      <>
                        <span className="font-medium">{m.canonical}</span>
                        <ConfidenceChip score={m.confidence} />
                      </>
                    ) : (
                      <span className="italic">unmapped · kept as attribute</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {issues.length > 0 ? <IssueList issues={issues} /> : null}
        </div>
      )}
    </section>
  );
}

function Fact({ label, value, warn }: { label: string; value: string | null | undefined; warn?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd className="num truncate text-xs text-ink" title={value ?? undefined}>
        {value ?? "—"}
        {warn ? <span className="ml-1 font-sans text-warning">· {warn}</span> : null}
      </dd>
    </div>
  );
}

const SEVERITY_TEXT: Record<Issue["severity"], string> = { info: "text-info", warn: "text-warning", error: "text-destructive" };

function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-muted">Sheet issues</h3>
      <ul className="flex flex-col gap-1 text-xs">
        {issues.map((i, idx) => (
          <li key={`${i.code}-${idx}`} className="flex gap-2">
            <span className={cn("w-10 shrink-0 uppercase tracking-wide", SEVERITY_TEXT[i.severity])}>{i.severity}</span>
            <span className="min-w-0 break-words text-ink">
              {i.message}
              {i.ec ? <span className="text-ink-muted"> · EC-{i.ec}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const LEVEL_CLASS: Record<ImportEventDto["level"], string> = { info: "text-ink-muted", warn: "text-warning", error: "text-destructive" };

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
}

function EventLog({ events }: { events: ImportEventDto[] }) {
  return (
    <section aria-labelledby="log-heading" className="flex min-h-0 flex-col bg-card hairline">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h2 id="log-heading" className="font-display text-lg text-ink">
          Event log
        </h2>
        <span className="num text-[11px] text-ink-muted">
          {events.length}
          {events.length >= MAX_EVENTS ? "+" : ""} · newest first
        </span>
      </div>
      {events.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-muted">No events yet.</p>
      ) : (
        <ol className="max-h-80 divide-y divide-border overflow-y-auto text-xs">
          {events.map((e) => {
            const hasData = e.data !== null && Object.keys(e.data).length > 0;
            return (
              <li key={e.id} className="flex gap-2 px-4 py-1.5">
                <time dateTime={e.createdAt} className="num shrink-0 text-ink-muted" suppressHydrationWarning>
                  {clock(e.createdAt)}
                </time>
                <span className={cn("w-10 shrink-0 font-medium uppercase tracking-wide", LEVEL_CLASS[e.level])}>{e.level}</span>
                <div className="min-w-0 flex-1">
                  <p className="break-words text-ink">{e.message}</p>
                  {hasData ? (
                    <details className="mt-0.5">
                      <summary className="cursor-pointer text-ink-muted hover:text-ink">data</summary>
                      <pre className="num mt-1 overflow-x-auto bg-paper-deep/60 p-2 text-[11px] leading-snug">{JSON.stringify(e.data, null, 2)}</pre>
                    </details>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
