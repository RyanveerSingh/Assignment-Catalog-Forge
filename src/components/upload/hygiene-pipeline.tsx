"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { hygieneStageFor, type HygieneItem, type HygieneReport, type HygieneSegment, type HygieneStage, type HygieneTone } from "@/core/metrics/hygiene";
import { CountUp } from "@/components/ext/count-up";
import { settle, stagger } from "@/components/ext/motion";
import { CARD } from "@/components/ext/surfaces";
import { api, storeApi } from "@/lib/client/api";
import { formatNumber, formatPercent } from "@/lib/format";

const REFRESH_MS = 10_000;

/* Chart slots, not new colours: green for what passed untouched, orange for what was repaired or
 * assumed, grey for what was flagged, light orange for conflicts and failures. */
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
 * The five deterministic stages as a row of raised cards with counts and a stacked bar each. Polls
 * every 10 s while the worker owns the import and once more when it lets go, so the final counts land.
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
    <section aria-labelledby="hygiene-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1">
        <h2 id="hygiene-heading" className="font-display text-lg text-ink">
          What we fixed in your sheet
        </h2>
        <p className="text-[11px] text-ink-muted" title="Counted from the stored rows after each deterministic stage, before any model saw them">
          Clean, repaired or assumed, and flagged, counted before any AI saw a row
          {active ? " · refreshes every 10 s" : ""}
          {failed ? <span className="text-warning"> · last refresh failed; showing the previous counts</span> : null}
        </p>
      </div>
      {report ? (
        <ol aria-label="Cleaning stages" className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-5">
          {report.stages.map((stage, i) => (
            <StageCard key={stage.key} stage={stage} index={i} isCurrent={stage.key === current} />
          ))}
        </ol>
      ) : (
        <p className={cn(CARD, "px-5 py-8 text-sm text-ink-muted")}>Counting…</p>
      )}
    </section>
  );
}

function StageCard({ stage, index, isCurrent }: { stage: HygieneStage; index: number; isCurrent: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.li initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={settle(reduce, 0.45, 0.2 + stagger(index, 0.06))} className={cn(CARD, "relative min-w-0 px-4 py-4", isCurrent && "shadow-[0_0_0_2px_var(--brand),var(--shadow-card)]")} aria-current={isCurrent ? "step" : undefined}>
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">
        <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-[10px]", isCurrent ? "bg-brand text-brand-foreground" : "bg-surface-2 text-ink-muted")}>
          {isCurrent ? <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-current" /> : <span aria-hidden>{index + 1}</span>}
        </span>
        <span className="truncate">{stage.label}</span>
        {isCurrent ? <span className="sr-only">, in progress</span> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-1.5">
        <CountUp value={stage.headline.value} format={formatNumber} className="font-display text-[1.75rem] leading-none text-ink tabular" />
        <span className="text-xs text-ink-muted">{stage.headline.unit}</span>
      </div>
      {stage.bar.length > 0 ? <Bar segments={stage.bar} delay={stagger(index, 0.06)} /> : <p className="mt-3 text-[11px] leading-[8px] text-ink-muted">{stage.empty}</p>}
      <Items items={stage.items} />
    </motion.li>
  );
}

/**
 * Flex-grow carries the share and a 2 px basis keeps a one-in-ten-thousand segment visible. The
 * segments grow out of the left end the first time the card scrolls into view (a transform, so the
 * track underneath stays put); later refreshes change the shares without replaying the entrance.
 */
function Bar({ segments, delay }: { segments: HygieneSegment[]; delay: number }) {
  const reduce = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);
  // Observe the full-width track, not the child: a box scaled to zero width has no area for IntersectionObserver to see.
  const inView = useInView(track, { once: true, amount: 0.5 });
  const label = segments.map((s) => `${s.label} ${formatPercent(s.share, 1)}`).join(", ");
  return (
    <div ref={track} role="img" aria-label={label} className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
      <motion.div className="flex h-full w-full origin-left gap-px" initial={{ scaleX: 0 }} animate={{ scaleX: inView ? 1 : 0 }} transition={settle(reduce, 0.7, 0.3 + delay)}>
        {segments.map((s) => (
          <div key={s.key} title={`${s.label}: ${formatNumber(s.value)} (${formatPercent(s.share, 1)})`} className={cn("h-full rounded-full", TONE_BG[s.tone])} style={{ flex: `${s.share} 1 2px` }} />
        ))}
      </motion.div>
    </div>
  );
}

function Items({ items }: { items: HygieneItem[] }) {
  return (
    <dl className="mt-3 flex flex-col gap-1 text-[11px]">
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
        {item.tone ? <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TONE_BG[item.tone])} /> : null}
        <span className="truncate">{item.label}</span>
      </dt>
      <span aria-hidden className="mb-[3px] min-w-2 flex-1 border-b border-dotted border-border" />
      <dd className={cn("num shrink-0", zero ? "text-ink-muted/80" : "font-medium text-ink")}>
        <CountUp value={item.value} format={formatNumber} />
      </dd>
    </div>
  );
}
