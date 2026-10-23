"use client";

import { cn } from "cn";
import { CARD, TH } from "@/components/ext/surfaces";
import type { StoreMetrics } from "@/db/repositories/metrics";
import { formatDuration, formatMicrosUsd, formatNumber, formatRelative, modelLabel } from "@/lib/format";
import { COVERAGE_SERIES } from "./charts";

const MAX_EVAL_METRICS = 6;

function compact(n: number): string {
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function formatMetric(v: number): string {
  if (Number.isInteger(v)) return formatNumber(v);
  return v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 id={id} className="font-display text-lg text-ink">
          {title}
        </h2>
        {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function TableEmpty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-line-strong px-4 py-8 text-center text-sm text-ink-muted">{children}</p>;
}

/** Shared chrome for the three metric tables: a raised card that scrolls sideways on phones, with a quiet row hover. */
function Grid({ head, children, minWidth = 720 }: { head: ReadonlyArray<{ label: string; right?: boolean; title?: string }>; children: React.ReactNode; minWidth?: number }) {
  return (
    <div className={cn(CARD, "overflow-x-auto")}>
      <table className="w-full border-separate border-spacing-0 text-[13px]" style={{ minWidth }}>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h.label} scope="col" title={h.title} className={cn(TH, "h-11 border-b border-border px-4 text-left whitespace-nowrap first:pl-5 last:pr-5", h.right && "text-right")}>
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr:last-child>td]:border-0 [&>tr]:transition-colors [&>tr]:hover:bg-surface-2/50 [&_td]:border-b [&_td]:border-border/70 [&_td]:px-4 [&_td]:py-3 [&_td:first-child]:pl-5 [&_td:last-child]:pr-5">{children}</tbody>
      </table>
    </div>
  );
}

const NUM = "num text-right";

export function ModelTable({ models }: { models: StoreMetrics["models"] }) {
  return (
    <Section id="models-heading" title="Per model" hint="Every successful call grouped by model and job; token counts in thousands (K) or millions (M)">
      {models.length === 0 ? (
        <TableEmpty>No AI calls yet.</TableEmpty>
      ) : (
        <Grid
          minWidth={880}
          head={[
            { label: "Model" },
            { label: "Job" },
            { label: "Calls", right: true },
            { label: "Tokens in", right: true, title: "Input tokens" },
            { label: "Tokens out", right: true, title: "Output tokens" },
            { label: "Reused", right: true, title: "Prompt-cache read tokens" },
            { label: "Cost", right: true },
            { label: "Typical", right: true, title: "Average latency" },
            { label: "Slowest 5%", right: true, title: "95th-percentile latency" },
          ]}
        >
          {models.map((m) => (
            <tr key={`${m.model}:${m.purpose}`}>
              <td className="font-medium text-ink" title={m.model}>
                {modelLabel(m.model)}
              </td>
              <td className="text-ink-muted">{m.purpose}</td>
              <td className={NUM}>{formatNumber(m.calls)}</td>
              <td className={NUM}>{compact(m.inputTokens)}</td>
              <td className={NUM}>{compact(m.outputTokens)}</td>
              <td className={NUM}>{compact(m.cacheReadTokens)}</td>
              <td className={NUM}>{formatMicrosUsd(m.costMicros, 4)}</td>
              <td className={NUM}>{formatDuration(m.avgLatencyMs)}</td>
              <td className={NUM}>{formatDuration(m.p95LatencyMs)}</td>
            </tr>
          ))}
        </Grid>
      )}
    </Section>
  );
}

/** Table twin of the coverage chart (the WCAG-clean equivalent; numbers never hide behind colour). */
export function TranslationTable({ translations }: { translations: StoreMetrics["translations"] }) {
  if (translations.length === 0) return null;
  return (
    <Grid minWidth={520} head={[{ label: "Language" }, ...COVERAGE_SERIES.map((s) => ({ label: s.label, right: true })), { label: "Coverage", right: true }]}>
      {translations.map((t) => (
        <tr key={t.locale}>
          <td className="font-medium text-ink uppercase">{t.locale}</td>
          {COVERAGE_SERIES.map((s) => (
            <td key={s.key} className={NUM}>
              {formatNumber(t[s.key])}
            </td>
          ))}
          <td className={cn(NUM, "font-medium text-brand")}>{Math.round(t.coverage * 100)}%</td>
        </tr>
      ))}
    </Grid>
  );
}

export function EvalTable({ evals }: { evals: StoreMetrics["evals"] }) {
  return (
    <Section id="evals-heading" title="Quality checks" hint="The latest 20 eval runs: a prompt version's output scored against hand-checked answers">
      {evals.length === 0 ? (
        <TableEmpty>No eval runs yet. Run `npm run eval` to score a prompt version.</TableEmpty>
      ) : (
        <Grid head={[{ label: "Name" }, { label: "Prompt" }, { label: "Model" }, { label: "Sample" }, { label: "When" }, { label: "Metrics" }]}>
          {evals.map((e) => {
            const numeric = Object.entries(e.metrics)
              .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
              .slice(0, MAX_EVAL_METRICS);
            return (
              <tr key={e.id}>
                <td className="font-medium text-ink">{e.name}</td>
                <td className="num">{e.promptVersion}</td>
                <td className="text-ink-muted" title={e.model}>
                  {modelLabel(e.model)}
                </td>
                <td className="text-ink-muted">{e.sample}</td>
                <td className="text-ink-muted">{formatRelative(e.createdAt)}</td>
                <td className="whitespace-normal">
                  {numeric.length === 0 ? (
                    <span className="text-ink-muted">—</span>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {numeric.map(([k, v]) => (
                        <li key={k} className="inline-flex h-6 items-center gap-1 rounded-full bg-surface-2 px-2 text-[11px]">
                          <span className="text-ink-muted">{k}</span>
                          <span className="num font-medium text-ink">{formatMetric(v)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </Grid>
      )}
    </Section>
  );
}
