"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "cn";
import { hygieneStageFor, type HygieneItem, type HygieneReport, type HygieneSegment, type HygieneStage, type HygieneStageKey, type HygieneTone } from "@/core/metrics/hygiene";
import { api, storeApi } from "@/lib/client/api";
import { formatNumber, formatPercent } from "@/lib/format";

const REFRESH_MS = 10_000;

/* Chart slots, not new colours: moss for what passed untouched, amber for what was repaired or
 * assumed, slate for what was flagged, clay for conflicts and failures. */
const TONE_BG: Record<HygieneTone, string> = {
  good: "bg-chart-3",
  changed: "bg-chart-1",
  notice: "bg-chart-4",
  bad: "bg-chart-5",
  muted: "bg-ink/25",
};

interface HygieneResponse {
  status: string;
  report: HygieneReport;
  generatedAt: string;
}

/**
 * The five deterministic stages as a horizontal flow with counts and a stacked bar each. Polls every
 * 10 s while the worker owns the import and once more when it lets go, so the final counts land.
 */
export function HygienePipeline({ storeSlug, importId, status, active, initial }: { storeSlug: string; importId: string; status: string; active: boolean; initial: HygieneReport | null }) {
  const url = `${storeApi(storeSlug)}/imports/${encodeURIComponent(importId)}/hygiene`;
  const [report, setReport] = useState<HygieneReport | null>(initial);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const r = await api<HygieneResponse>(url, { cache: "no-store" });
      setReport(r.report);
      setFailed(false);
    } catch {
      setFailed(true); // keep the last counts; the next tick retries
    } finally {
      inFlight.current = false;
    }
  }, [url]);

  useEffect(() => {
    if (initial === null) void load();
  }, [initial, load]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [active, load]);

  const wasActive = useRef(active);
  useEffect(() => {
    const prev = wasActive.current;
    wasActive.current = active;
    if (prev && !active) void load();
  }, [active, load]);

  const current = active ? hygieneStageFor(status) : null;

  return (
    <section aria-labelledby="hygiene-heading" className="bg-card hairline">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-2.5">
        <h2 id="hygiene-heading" className="font-display text-lg text-ink">
          What we fixed in your sheet
        </h2>
        <p className="text-[11px] text-ink-muted" title="Counted from the stored rows after each deterministic stage, before any model saw them">
          What was already clean, what we repaired or assumed, and what we flagged, counted before any AI saw a row
          {active ? " · refreshes every 10 s" : ""}
          {failed ? <span className="text-warning"> · last refresh failed; showing the previous counts</span> : null}
        </p>
      </div>
      {report ? <StageFlow stages={report.stages} current={current} /> : <p className="px-4 py-6 text-sm text-ink-muted">Counting…</p>}
    </section>
  );
}

function StageFlow({ stages, current }: { stages: HygieneStage[]; current: HygieneStageKey | null }) {
  return (
    <ol
      aria-label="Cleaning stages"
      className={cn(
        "grid grid-cols-1 divide-y divide-border",
        "sm:grid-cols-2 sm:divide-y-0 sm:[&>li:nth-child(even)]:border-l sm:[&>li:nth-child(n+3)]:border-t",
        "xl:grid-cols-5 xl:[&>li]:border-t-0 xl:[&>li]:border-l xl:[&>li:first-child]:border-l-0",
      )}
    >
      {stages.map((stage, i) => (
        <StageCard key={stage.key} stage={stage} index={i} isCurrent={stage.key === current} isLast={i === stages.length - 1} />
      ))}
    </ol>
  );
}

function StageCard({ stage, index, isCurrent, isLast }: { stage: HygieneStage; index: number; isCurrent: boolean; isLast: boolean }) {
  return (
    <li className="relative min-w-0 border-border px-4 py-3" aria-current={isCurrent ? "step" : undefined}>
      {isLast ? null : <ChevronRightIcon aria-hidden className="absolute top-3.5 -right-2 z-10 hidden size-4 bg-card text-ink-muted/70 xl:block" />}
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-ink-muted">
        <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] ring-1 ring-inset", isCurrent ? "bg-brand text-brand-foreground ring-brand" : "bg-card text-ink-muted ring-border")}>
          {isCurrent ? <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-current" /> : <span aria-hidden>{index + 1}</span>}
        </span>
        <span className="truncate">{stage.label}</span>
        {isCurrent ? <span className="sr-only">, in progress</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5">
        <span className="font-display text-2xl leading-none text-ink tabular">{formatNumber(stage.headline.value)}</span>
        <span className="text-xs text-ink-muted">{stage.headline.unit}</span>
      </div>
      {stage.bar.length > 0 ? <Bar segments={stage.bar} /> : <p className="mt-2 text-[11px] leading-[6px] text-ink-muted">{stage.empty}</p>}
      <Items items={stage.items} />
    </li>
  );
}

/** Flex-grow carries the share and a 2 px basis keeps a one-in-ten-thousand segment visible. */
function Bar({ segments }: { segments: HygieneSegment[] }) {
  const label = segments.map((s) => `${s.label} ${formatPercent(s.share, 1)}`).join(", ");
  return (
    <div role="img" aria-label={label} className="mt-2 flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-paper-deep">
      {segments.map((s) => (
        <div key={s.key} title={`${s.label}: ${formatNumber(s.value)} (${formatPercent(s.share, 1)})`} className={cn("h-full", TONE_BG[s.tone])} style={{ flex: `${s.share} 1 2px` }} />
      ))}
    </div>
  );
}

function Items({ items }: { items: HygieneItem[] }) {
  return (
    <dl className="mt-2.5 flex flex-col gap-0.5 text-[11px]">
      {items.map((i) => (
        <Fragment key={i.key}>
          <Row item={i} />
          {i.children?.map((c) => <Row key={c.key} item={c} child />)}
        </Fragment>
      ))}
    </dl>
  );
}

function Row({ item, child = false }: { item: HygieneItem; child?: boolean }) {
  const zero = item.value === 0;
  const muted = zero || child;
  return (
    <div className={cn("flex items-baseline gap-1.5", child && "pl-3")}>
      <dt className={cn("flex min-w-0 items-center gap-1.5", muted ? "text-ink-muted/80" : "text-ink-muted")} title={item.label}>
        {item.tone ? <span aria-hidden className={cn("size-2 shrink-0 rounded-[2px]", TONE_BG[item.tone])} /> : null}
        <span className="truncate">{item.label}</span>
      </dt>
      <span aria-hidden className="mb-[3px] min-w-2 flex-1 border-b border-dotted border-border" />
      <dd className={cn("num shrink-0", zero ? "text-ink-muted/80" : "text-ink")}>{formatNumber(item.value)}</dd>
    </div>
  );
}
