"use client";

import { cn } from "cn";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CostStrategies as CostStrategiesData, CostStrategyRow, StrategyKey } from "@/core/metrics/cost-strategies";
import { formatMicrosUsd, formatNumber, formatPercent } from "@/lib/format";

const COPY: Record<StrategyKey, { label: string; describe: (d: CostStrategiesData) => string }> = {
  naive: {
    label: "Sonnet everywhere",
    describe: () => "Every call on the strong model in realtime, with cache reads and writes billed as fresh input: the baseline the savings meter uses.",
  },
  routed: {
    label: "Routed, no prompt cache",
    describe: () => "The models the router actually chose, in realtime, with every cached token still billed as fresh input.",
  },
  actual: {
    label: "Actual",
    describe: (d) => {
      const cached = d.cachedCalls > 0 ? `, with ${formatNumber(d.cachedCalls)} answer${d.cachedCalls === 1 ? "" : "s"} served from the response cache at no cost` : "";
      return `Routing, the prompt cache and the response cache together: ${d.demo ? "what the recorded tokens would cost" : "the recorded spend"}${cached}.`;
    },
  },
  economy: {
    label: "Actual, Economy mode",
    describe: (d) =>
      d.batchedCalls > 0
        ? `The same calls through the Batch API at half price; the ${formatNumber(d.batchedCalls)} already batched are not halved twice.`
        : "The same calls through the Batch API, which halves each one in exchange for waiting up to an hour.",
  },
};

const NUM = "num text-right";

/** Four prices for the same recorded calls, so the routing, cache and batch decisions can be read as money. */
export function CostStrategies({ strategies }: { strategies: CostStrategiesData }) {
  const baseline = strategies.rows.find((r) => r.key === "naive")?.costMicros ?? 0;
  return (
    <section aria-labelledby="strategies-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="strategies-heading" className="font-display text-xl text-ink">
          Cost strategies
        </h2>
        <p className="text-xs text-ink-muted">
          {formatNumber(strategies.totalCalls)} succeeded call{strategies.totalCalls === 1 ? "" : "s"} priced four ways · per 1,000 of the {formatNumber(strategies.productsThroughAi)} products that went through the AI
        </p>
      </div>
      {strategies.totalCalls === 0 ? (
        <p className="rounded-sm border border-dashed border-border px-4 py-6 text-center text-sm text-ink-muted">No AI calls yet.</p>
      ) : (
        <div className="rounded-sm bg-card hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Strategy</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Per 1,000 products</TableHead>
                <TableHead className="text-right">Savings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {strategies.rows.map((row) => (
                <StrategyRow key={row.key} row={row} data={strategies} baseline={baseline} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {strategies.demo ? <p className="text-xs text-ink-muted">Demo provider: costs are estimated at Haiku and Sonnet list rates.</p> : null}
    </section>
  );
}

function StrategyRow({ row, data, baseline }: { row: CostStrategyRow; data: CostStrategiesData; baseline: number }) {
  const copy = COPY[row.key];
  const isActual = row.key === "actual";
  const width = baseline > 0 ? Math.min(1, row.costMicros / baseline) : 0;
  return (
    <TableRow className={cn(isActual && "bg-brand-soft/30")}>
      <TableCell className="max-w-xs whitespace-normal align-top">
        <div className="flex items-center gap-2">
          <span className={cn("text-ink", isActual ? "font-semibold" : "font-medium")}>{copy.label}</span>
          {isActual ? <span className="rounded-sm bg-brand-soft px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-brand">{data.demo ? "estimated" : "recorded"}</span> : null}
        </div>
        <p className="mt-0.5 text-xs leading-snug text-ink-muted">{copy.describe(data)}</p>
      </TableCell>
      <TableCell className={cn(NUM, "align-top")}>{formatNumber(row.calls)}</TableCell>
      <TableCell className={cn(NUM, "align-top")}>
        <div className="text-ink">{formatMicrosUsd(row.costMicros)}</div>
        <div aria-hidden className="mt-1 ml-auto h-[3px] w-24 overflow-hidden rounded-full bg-paper-deep">
          <div className={cn("h-full rounded-full", isActual ? "bg-brand" : "bg-ink/40")} style={{ width: `${width * 100}%` }} />
        </div>
      </TableCell>
      <TableCell className={cn(NUM, "align-top")}>{row.per1000Micros === null ? <span className="text-ink-muted">—</span> : formatMicrosUsd(row.per1000Micros)}</TableCell>
      <TableCell className={cn(NUM, "align-top")}>
        {row.key === "naive" ? (
          <span className="text-ink-muted">baseline</span>
        ) : (
          <>
            <span className={cn(row.savedMicros > 0 ? "text-success" : "text-ink-muted")}>{formatMicrosUsd(row.savedMicros)}</span>
            <span className="ml-1 text-ink-muted">· {formatPercent(row.savedShare)}</span>
          </>
        )}
      </TableCell>
    </TableRow>
  );
}
