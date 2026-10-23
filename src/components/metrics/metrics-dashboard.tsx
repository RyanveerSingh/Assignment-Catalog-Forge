"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CircleXIcon, EyeIcon, LayersIcon, ListChecksIcon, RefreshCw, SparklesIcon, UploadIcon } from "lucide-react";
import { cn } from "cn";
import { EmptyState } from "@/components/ext/page-header";
import { Reveal } from "@/components/ext/reveal";
import { StatTile } from "@/components/ext/stat-tile";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CostStrategies as CostStrategiesData } from "@/core/metrics/cost-strategies";
import type { StoreMetrics } from "@/db/repositories/metrics";
import { api, ApiError, storeApi } from "@/lib/client/api";
import { formatNumber, formatRelative } from "@/lib/format";
import { ChartCard, CostOverTimeChart, CoverageLegend, ModelUsageChart, RoutingChart, TranslationCoverageChart } from "./charts";
import { CostSection } from "./cost-section";
import { CostStrategies } from "./cost-strategies";
import { HeadlineFigures } from "./headline-figures";
import { SpeedSection } from "./speed-section";
import { EvalTable, ModelTable, TranslationTable } from "./tables";

const REFRESH_MS = 30_000;
const CLOCK_MS = 10_000;

/** The metrics route adds the priced strategies to the repository's figures. */
type MetricsData = StoreMetrics & { strategies: CostStrategiesData };

/** Rates roll through CountUp as whole tenths of a percent, so "41.7%" never shows as "42%" mid-flight. */
const tenths = (fraction: number): number => Math.round(fraction * 1000);
const formatTenths = (n: number): string => `${(n / 10).toFixed(1)}%`;

export function MetricsDashboard({ storeSlug }: { storeSlug: string }) {
  const [data, setData] = useState<MetricsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [, setClock] = useState(0);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const next = await api<MetricsData>(`${storeApi(storeSlug)}/metrics`, { cache: "no-store" });
      setData(next);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load metrics");
    } finally {
      inFlight.current = false;
      setRefreshing(false);
    }
  }, [storeSlug]);

  useEffect(() => {
    void load();
    // Refresh only while the tab is visible; the clock interval just re-renders the "updated … ago" label.
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    const clock = window.setInterval(() => setClock((c) => c + 1), CLOCK_MS);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, [load]);

  const toolbar = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      <p className="text-xs text-ink-muted" aria-live="polite">
        {updatedAt ? `Updated ${formatRelative(new Date(updatedAt).toISOString())} · refreshes every 30 s` : "Loading metrics…"}
      </p>
      <Button variant="outline" onClick={() => void load()} disabled={refreshing} className="h-9 cursor-pointer rounded-full">
        <RefreshCw aria-hidden className={cn(refreshing && "animate-spin")} />
        Refresh
      </Button>
    </div>
  );

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        {toolbar}
        {error ? (
          <div role="alert" className="flex items-start gap-2 rounded-2xl bg-destructive/5 px-4 py-3 text-sm text-destructive ring-1 ring-destructive/20">
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
            <Button variant="outline" size="xs" className="ml-auto cursor-pointer rounded-full" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : (
          <div aria-busy="true" aria-label="Loading metrics" className="flex flex-col gap-6">
            <Skeleton className="h-36 rounded-2xl" />
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-72 rounded-2xl" />
              <Skeleton className="h-72 rounded-2xl" />
            </div>
          </div>
        )}
      </div>
    );
  }

  const { products: p, imports: i } = data;
  if (i.total === 0 && p.total === 0) {
    return (
      <div className="flex flex-col gap-6">
        {toolbar}
        <EmptyState
          title="Run an import to see metrics"
          description="Cost, speed and translation coverage appear here as soon as the first sheet has been processed."
          action={
            <Link href={`/app/${encodeURIComponent(storeSlug)}/upload`} className={cn(buttonVariants({ size: "lg" }), "cursor-pointer rounded-full")}>
              Upload a file
            </Link>
          }
        />
      </div>
    );
  }

  const decided = p.total - (p.byStatus.pending_ai ?? 0);
  return (
    <div className={cn("flex flex-col gap-8 transition-opacity", refreshing && "opacity-80")}>
      {toolbar}
      {error ? (
        <p role="alert" className="flex items-center gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-xs text-warning">
          <AlertCircle aria-hidden className="size-3.5" />
          Showing the last successful refresh. {error}
        </p>
      ) : null}

      <HeadlineFigures data={data} />

      <section aria-labelledby="overview-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 id="overview-heading" className="font-display text-lg text-ink">
            Overview
          </h2>
          <p className="text-xs text-ink-muted">How many products were written cleanly, how many needed a person and how much came through</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-6">
          <StatTile index={0} label="Success rate" value={tenths(p.successRate)} format={formatTenths} icon={ListChecksIcon} tone="success" context={`${formatNumber((p.byStatus.draft ?? 0) + (p.byStatus.approved ?? 0))} of ${formatNumber(decided)} decided`} />
          <StatTile index={1} label="Review rate" value={tenths(p.reviewRate)} format={formatTenths} icon={EyeIcon} tone="warning" context={`${formatNumber(p.byStatus.needs_review ?? 0)} need review`} />
          <StatTile index={2} label="Failure rate" value={tenths(p.failureRate)} format={formatTenths} icon={CircleXIcon} tone="danger" context={`${formatNumber(p.byStatus.failed ?? 0)} failed`} />
          <StatTile index={3} label="Being written" value={p.byStatus.pending_ai ?? 0} format={formatNumber} icon={SparklesIcon} tone="brand" context={`of ${formatNumber(p.total)} products`} />
          <StatTile index={4} label="Imports completed" value={i.completed} format={formatNumber} icon={UploadIcon} context={`${formatNumber(i.active)} active · ${formatNumber(i.needsAttention)} need attention`} />
          <StatTile index={5} label="Rows processed" value={i.rowsProcessed} format={formatNumber} icon={LayersIcon} tone="info" context="in completed imports" />
        </div>
      </section>

      <Reveal index={1}>
        <CostSection cost={data.cost} />
      </Reveal>

      {/* The bento: the cost curve takes the wide slot, the three breakdowns share the rest. */}
      <section aria-label="Charts" className="grid gap-4 lg:grid-cols-6">
        <Reveal index={0} className="lg:col-span-4">
          <ChartCard title="AI cost over time" subtitle="What the last 30 days of writing and translating cost, per day">
            <CostOverTimeChart data={data.costOverTime} />
          </ChartCard>
        </Reveal>
        <Reveal index={1} className="lg:col-span-2">
          <ChartCard title="Who wrote what" subtitle="Products per model tier">
            <RoutingChart routing={data.routing} />
          </ChartCard>
        </Reveal>
        <Reveal index={2} className="lg:col-span-3">
          <ChartCard title="Which models did the work" subtitle="Cost by model; hover a bar for the token counts">
            <ModelUsageChart models={data.models} />
          </ChartCard>
        </Reveal>
        <Reveal index={3} className="lg:col-span-3">
          <ChartCard title="Translation coverage" subtitle="How many product titles exist in each language" legend={<CoverageLegend />}>
            <TranslationCoverageChart translations={data.translations} />
          </ChartCard>
        </Reveal>
      </section>

      <Reveal>
        <CostStrategies strategies={data.strategies} />
      </Reveal>

      <Reveal>
        <TranslationTable translations={data.translations} />
      </Reveal>

      <Reveal>
        <SpeedSection speed={data.speed} storeSlug={storeSlug} />
      </Reveal>

      <Reveal>
        <ModelTable models={data.models} />
      </Reveal>

      <Reveal>
        <EvalTable evals={data.evals} />
      </Reveal>
    </div>
  );
}
