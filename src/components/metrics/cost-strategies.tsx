"use client";

import { cn } from "cn";
import { Chip } from "@/components/ext/chip";
import { CARD, TH } from "@/components/ext/surfaces";
import type { CostStrategies as CostStrategiesData, CostStrategyRow, StrategyKey } from "@/core/metrics/cost-strategies";
import { formatMicrosUsd, formatNumber, formatPercent } from "@/lib/format";

const COPY: Record<StrategyKey, { label: string; describe: (d: CostStrategiesData) => string }> = {
  naive: {
    label: "Strong model for everything",
    describe: () => "Every call on the strong model (Sonnet) in realtime, with nothing reused between prompts: the list-price figure the savings meter compares against.",
  },
  routed: {
    label: "Cheaper models, no reuse",
    describe: () => "The models actually chosen for each product, in realtime, but with every repeated prompt paid for in full.",
  },
  actual: {
    label: "What it actually cost",
    describe: (d) => {
      const cached = d.cachedCalls > 0 ? `, with ${formatNumber(d.cachedCalls)} answer${d.cachedCalls === 1 ? "" : "s"} reused from an earlier identical call at no cost` : "";
      return `Cheaper models where safe, plus prompt reuse: ${d.demo ? "what the recorded tokens would cost" : "the recorded spend"}${cached}.`;
    },
  },
  economy: {
    label: "The same, in Economy mode",
    describe: (d) =>
      d.batchedCalls > 0
        ? `The same calls sent in batches at half price; the ${formatNumber(d.batchedCalls)} already batched are not halved twice.`
        : "The same calls sent in batches, which halves each one in exchange for waiting up to an hour.",
  },
};

const HEAD = cn(TH, "h-11 border-b border-border px-4 text-left whitespace-nowrap first:pl-5 last:pr-5");
const NUM = "num text-right";

/** Four prices for the same recorded calls, so the routing, cache and batch decisions can be read as money. */
export function CostStrategies({ strategies }: { strategies: CostStrategiesData }) {
  const baseline = strategies.rows.find((r) => r.key === "naive")?.costMicros ?? 0;
  return (
    <section aria-labelledby="strategies-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 id="strategies-heading" className="font-display text-lg text-ink">
          What the same work would have cost
        </h2>
        <p className="text-xs text-ink-muted">
          The {formatNumber(strategies.totalCalls)} successful AI call{strategies.totalCalls === 1 ? "" : "s"} priced four ways; per-1,000 figures use the {formatNumber(strategies.productsThroughAi)} products the AI wrote
        </p>
      </div>
      {strategies.totalCalls === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-muted">No AI calls yet.</p>
      ) : (
        <div className={cn(CARD, "overflow-x-auto")}>
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th scope="col" className={HEAD}>
                  Approach
                </th>
                <th scope="col" className={cn(HEAD, "text-right")}>
                  Calls
                </th>
                <th scope="col" className={cn(HEAD, "text-right")}>
                  Cost
                </th>
                <th scope="col" className={cn(HEAD, "text-right")}>
                  Per 1,000 products
                </th>
                <th scope="col" className={cn(HEAD, "text-right")}>
                  Savings
                </th>
              </tr>
            </thead>
            <tbody>
              {strategies.rows.map((row) => (
                <StrategyRow key={row.key} row={row} data={strategies} baseline={baseline} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {strategies.demo ? <p className="px-1 text-xs text-ink-muted">Demo writer in use: costs are estimated at Haiku and Sonnet list rates.</p> : null}
    </section>
  );
}

function StrategyRow({ row, data, baseline }: { row: CostStrategyRow; data: CostStrategiesData; baseline: number }) {
  const copy = COPY[row.key];
  const isActual = row.key === "actual";
  const width = baseline > 0 ? Math.min(1, row.costMicros / baseline) : 0;
  const cell = cn("border-b border-border/70 px-4 py-3 align-top first:pl-5 last:pr-5", isActual && "bg-brand-soft/40");
  return (
    <tr className="transition-colors hover:bg-surface-2/50 last:[&>td]:border-0">
      <td className={cn(cell, "max-w-xs whitespace-normal")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-ink", isActual ? "font-semibold" : "font-medium")}>{copy.label}</span>
          {isActual ? <Chip tone="brand">{data.demo ? "estimated" : "recorded"}</Chip> : null}
        </div>
        <p className="mt-0.5 text-xs leading-snug text-ink-muted">{copy.describe(data)}</p>
      </td>
      <td className={cn(cell, NUM)}>{formatNumber(row.calls)}</td>
      <td className={cn(cell, NUM)}>
        <div className="font-medium text-ink">{formatMicrosUsd(row.costMicros)}</div>
        <div aria-hidden className="mt-1.5 ml-auto h-1 w-24 overflow-hidden rounded-full bg-surface-2">
          <div className={cn("h-full origin-left rounded-full", isActual ? "bg-brand" : "bg-ink/35")} style={{ transform: `scaleX(${width})` }} />
        </div>
      </td>
      <td className={cn(cell, NUM)}>{row.per1000Micros === null ? <span className="text-ink-muted">—</span> : formatMicrosUsd(row.per1000Micros)}</td>
      <td className={cn(cell, NUM)}>
        {row.key === "naive" ? (
          <span className="text-ink-muted">list price</span>
        ) : (
          <>
            <span className={cn("font-medium", row.savedMicros > 0 ? "text-success" : "text-ink-muted")}>{formatMicrosUsd(row.savedMicros)}</span>
            <span className="ml-1 text-ink-muted">· {formatPercent(row.savedShare)}</span>
          </>
        )}
      </td>
    </tr>
  );
}
