"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { StoreMetrics } from "@/db/repositories/metrics";
import { formatMicrosUsd, formatNumber, formatPercent, modelLabel, tierLabel } from "@/lib/format";

/*
 * Chart tokens: --chart-1 orange for every single-series chart (nominal categories share one hue);
 * orange / light orange / ink for the translation stack, whose legend and table twin carry identity.
 */
const TICK = { fill: "var(--ink-muted)", fontSize: 11 } as const;
const GRID = "var(--border)";
const SURFACE = "var(--card)";
const BAR_CURSOR = { fill: "var(--surface-2)" } as const;
const ROW_HEIGHT = 40;

/** A raised chart card: the title and subtitle, an optional legend, then the chart. */
export function ChartCard({ title, subtitle, legend, children }: { title: string; subtitle?: string; legend?: React.ReactNode; children: React.ReactNode }) {
  return (
    <figure className="card-raised flex h-full flex-col rounded-2xl p-5">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="font-display text-base text-ink">{title}</h3>
          {subtitle ? <p className="text-xs text-ink-muted">{subtitle}</p> : null}
        </div>
        {legend}
      </figcaption>
      <div className="min-h-0 flex-1">{children}</div>
    </figure>
  );
}

function ChartEmpty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-40 items-center justify-center rounded-xl bg-surface-2/60 text-sm text-ink-muted">{children}</div>;
}

interface TipRow {
  label: string;
  value: string;
  color?: string;
}

/** Values lead, labels follow; series identity is a short line key in the series colour, text stays in ink. */
function ChartTip({ title, rows }: { title: string; rows: TipRow[] }) {
  return (
    <div className="min-w-40 rounded-xl bg-card px-3 py-2 text-xs shadow-[var(--shadow-pop)] ring-1 ring-border">
      <div className="mb-1 font-medium text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-ink-muted">
            {r.color ? <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: r.color }} /> : null}
            {r.label}
          </span>
          <span className="num text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function compact(n: number): string {
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

type CostPoint = StoreMetrics["costOverTime"][number];

export function CostOverTimeChart({ data }: { data: CostPoint[] }) {
  if (data.length === 0) return <ChartEmpty>No AI calls in the last 30 days.</ChartEmpty>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="day" tickFormatter={dayLabel} tick={TICK} tickLine={false} axisLine={false} minTickGap={28} />
        <YAxis tickFormatter={(v: number) => formatMicrosUsd(v)} tick={TICK} tickLine={false} axisLine={false} width={64} />
        <Tooltip
          cursor={{ stroke: "var(--ink-muted)", strokeWidth: 1 }}
          isAnimationActive={false}
          content={({ active, payload }) => {
            const row = active ? (payload?.[0]?.payload as CostPoint | undefined) : undefined;
            if (!row) return null;
            return (
              <ChartTip
                title={dayLabel(row.day)}
                rows={[
                  { label: "Cost", value: formatMicrosUsd(row.costMicros, 4), color: "var(--chart-1)" },
                  { label: "Calls", value: formatNumber(row.calls) },
                ]}
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="costMicros"
          name="Cost"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="var(--chart-1)"
          fillOpacity={0.1}
          dot={false}
          activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2, fill: "var(--chart-1)" }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

interface ModelRow {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  costMicros: number;
}

export function ModelUsageChart({ models }: { models: StoreMetrics["models"] }) {
  const byModel = new Map<string, ModelRow>();
  for (const m of models) {
    const row = byModel.get(m.model) ?? { model: m.model, calls: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costMicros: 0 };
    row.calls += m.calls;
    row.inputTokens += m.inputTokens;
    row.outputTokens += m.outputTokens;
    row.cacheReadTokens += m.cacheReadTokens;
    row.costMicros += m.costMicros;
    byModel.set(m.model, row);
  }
  const rows = [...byModel.values()].sort((a, b) => b.costMicros - a.costMicros);
  if (rows.length === 0) return <ChartEmpty>No AI calls yet.</ChartEmpty>;
  return (
    <ResponsiveContainer width="100%" height={rows.length * ROW_HEIGHT + 36}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tickFormatter={(v: number) => formatMicrosUsd(v)} tick={TICK} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="model" tickFormatter={modelLabel} width={110} tick={TICK} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={BAR_CURSOR}
          isAnimationActive={false}
          content={({ active, payload }) => {
            const row = active ? (payload?.[0]?.payload as ModelRow | undefined) : undefined;
            if (!row) return null;
            return (
              <ChartTip
                title={`${modelLabel(row.model)} · ${row.model}`}
                rows={[
                  { label: "Cost", value: formatMicrosUsd(row.costMicros, 4), color: "var(--chart-1)" },
                  { label: "Calls", value: formatNumber(row.calls) },
                  { label: "Tokens in", value: compact(row.inputTokens) },
                  { label: "Tokens out", value: compact(row.outputTokens) },
                  { label: "Reused (cache reads)", value: compact(row.cacheReadTokens) },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="costMicros" name="Cost" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

type RoutingRow = StoreMetrics["routing"][number];

export function RoutingChart({ routing }: { routing: RoutingRow[] }) {
  const rows = [...routing].sort((a, b) => b.products - a.products);
  if (rows.length === 0) return <ChartEmpty>No products routed yet.</ChartEmpty>;
  return (
    <ResponsiveContainer width="100%" height={rows.length * ROW_HEIGHT + 36}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tickFormatter={(v: number) => compact(v)} allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="tier" tickFormatter={tierLabel} width={100} tick={TICK} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={BAR_CURSOR}
          isAnimationActive={false}
          content={({ active, payload }) => {
            const row = active ? (payload?.[0]?.payload as RoutingRow | undefined) : undefined;
            if (!row) return null;
            return (
              <ChartTip
                title={`${tierLabel(row.tier)} (${row.tier})`}
                rows={[
                  { label: "Products", value: formatNumber(row.products), color: "var(--chart-1)" },
                  { label: "AI cost", value: formatMicrosUsd(row.costMicros, 4) },
                  { label: "Per product", value: formatMicrosUsd(row.products ? row.costMicros / row.products : 0, 4) },
                ]}
              />
            );
          }}
        />
        <Bar dataKey="products" name="Products" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

type TranslationRow = StoreMetrics["translations"][number];

export const COVERAGE_SERIES: ReadonlyArray<{ key: "fresh" | "outdated" | "failed"; label: string; color: string }> = [
  { key: "fresh", label: "Fresh", color: "var(--chart-1)" },
  { key: "outdated", label: "Outdated", color: "var(--chart-5)" },
  { key: "failed", label: "Failed", color: "var(--chart-2)" },
];

export function CoverageLegend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted" aria-label="Legend">
      {COVERAGE_SERIES.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

export function TranslationCoverageChart({ translations }: { translations: TranslationRow[] }) {
  if (translations.length === 0) return <ChartEmpty>No translations yet.</ChartEmpty>;
  return (
    <ResponsiveContainer width="100%" height={translations.length * ROW_HEIGHT + 36}>
      <BarChart data={translations} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tickFormatter={(v: number) => compact(v)} allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="locale" tickFormatter={(l: string) => l.toUpperCase()} width={40} tick={TICK} tickLine={false} axisLine={false} />
        <Tooltip
          cursor={BAR_CURSOR}
          isAnimationActive={false}
          content={({ active, payload }) => {
            const row = active ? (payload?.[0]?.payload as TranslationRow | undefined) : undefined;
            if (!row) return null;
            return (
              <ChartTip
                title={`${row.locale.toUpperCase()} · ${formatPercent(row.coverage)} covered`}
                rows={[
                  ...COVERAGE_SERIES.map((s) => ({ label: s.label, value: formatNumber(row[s.key]), color: s.color })),
                  { label: "Translatable", value: formatNumber(row.products) },
                ]}
              />
            );
          }}
        />
        {COVERAGE_SERIES.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="coverage"
            fill={s.color}
            stroke={SURFACE}
            strokeWidth={2}
            radius={i === COVERAGE_SERIES.length - 1 ? [0, 4, 4, 0] : 0}
            maxBarSize={20}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
