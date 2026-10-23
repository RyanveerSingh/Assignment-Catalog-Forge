"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { cn } from "cn";
import { Kpi } from "@/components/ext/kpi";
import { EmptyState } from "@/components/ext/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CostStrategies as CostStrategiesData } from "@/core/metrics/cost-strategies";
import type { StoreMetrics } from "@/db/repositories/metrics";
import { api, ApiError, storeApi } from "@/lib/client/api";
import { formatNumber, formatPercent, formatRelative } from "@/lib/format";
import { ChartCard, CostOverTimeChart, CoverageLegend, ModelUsageChart, RoutingChart, TranslationCoverageChart } from "./charts";
import { CostSection } from "./cost-section";
import { CostStrategies } from "./cost-strategies";
import { SpeedSection } from "./speed-section";
import { EvalTable, ModelTable, TranslationTable } from "./tables";

const REFRESH_MS = 30_000;
const CLOCK_MS = 10_000;

/** The metrics route adds the priced strategies to the repository's figures. */
type MetricsData = StoreMetrics & { strategies: CostStrategiesData };

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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-ink-muted" aria-live="polite">
        {updatedAt ? `Updated ${formatRelative(new Date(updatedAt).toISOString())} · refreshes every 30 s` : "Loading metrics…"}
      </p>
      <Button variant="outline" size="sm" onClick={() => void load()} disabled={refreshing}>
        <RefreshCw aria-hidden className={cn(refreshing && "animate-spin")} />
        Refresh
      </Button>
    </div>
  );

  if (!data) {
    return (
      <div className="space-y-6">
        {toolbar}
        {error ? (
          <div role="alert" className="flex items-start gap-2 rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
            <Button variant="outline" size="xs" className="ml-auto" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : (
          <div aria-busy="true" aria-label="Loading metrics" className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-24 rounded-sm" />
              ))}
            </div>
            <Skeleton className="h-40 rounded-sm" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64 rounded-sm" />
              <Skeleton className="h-64 rounded-sm" />
            </div>
          </div>
        )}
      </div>
    );
  }

  const { products: p, imports: i } = data;
  if (i.total === 0 && p.total === 0) {
    return (
      <div className="space-y-6">
        {toolbar}
        <EmptyState
          title="Run an import to see metrics"
          description="Cost, speed and translation coverage appear here as soon as the first sheet has been processed."
          action={
            <Link href={`/app/${encodeURIComponent(storeSlug)}/upload`} className={cn(buttonVariants({ size: "sm" }), "cursor-pointer")}>
              Upload a file
            </Link>
          }
        />
      </div>
    );
  }

  const decided = p.total - (p.byStatus.pending_ai ?? 0);
  return (
    <div className={cn("space-y-8 transition-opacity", refreshing && "opacity-80")}>
      {toolbar}
      {error ? (
        <p role="alert" className="flex items-center gap-2 rounded-sm bg-warning-soft px-3 py-2 text-xs text-warning">
          <AlertCircle aria-hidden className="size-3.5" />
          Showing the last successful refresh. {error}
        </p>
      ) : null}

      <section aria-labelledby="overview-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="overview-heading" className="font-display text-xl text-ink">
            Overview
          </h2>
          <p className="text-xs text-ink-muted">How many products came through, how many were written cleanly and how many needed a person</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Products processed" value={formatNumber(p.total)} hint={`${formatNumber(p.byStatus.pending_ai ?? 0)} being written`} />
        <Kpi label="Success rate" value={formatPercent(p.successRate, 1)} tone="success" hint={`${formatNumber((p.byStatus.draft ?? 0) + (p.byStatus.approved ?? 0))} of ${formatNumber(decided)} decided`} />
        <Kpi label="Review rate" value={formatPercent(p.reviewRate, 1)} tone="warning" hint={`${formatNumber(p.byStatus.needs_review ?? 0)} need review`} />
        <Kpi label="Failure rate" value={formatPercent(p.failureRate, 1)} tone="danger" hint={`${formatNumber(p.byStatus.failed ?? 0)} failed`} />
        <Kpi label="Imports completed" value={formatNumber(i.completed)} hint={`${formatNumber(i.active)} active · ${formatNumber(i.needsAttention)} need attention`} />
        <Kpi label="Rows processed" value={formatNumber(i.rowsProcessed)} hint="in completed imports" />
        </div>
      </section>

      <CostSection cost={data.cost} />

      <CostStrategies strategies={data.strategies} />

      <section aria-label="Charts" className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="AI cost over time" subtitle="What the last 30 days of writing and translating cost, per day">
          <CostOverTimeChart data={data.costOverTime} />
        </ChartCard>
        <ChartCard title="Which models did the work" subtitle="Cost by model; hover a bar for the token counts">
          <ModelUsageChart models={data.models} />
        </ChartCard>
        <ChartCard title="Who wrote what" subtitle="Products per model tier: cheaper models where the rows are simple, stronger ones where they are not">
          <RoutingChart routing={data.routing} />
        </ChartCard>
        <ChartCard title="Translation coverage" subtitle="How many product titles exist in each language" legend={<CoverageLegend />}>
          <TranslationCoverageChart translations={data.translations} />
        </ChartCard>
      </section>

      <TranslationTable translations={data.translations} />

      <SpeedSection speed={data.speed} storeSlug={storeSlug} />

      <ModelTable models={data.models} />

      <EvalTable evals={data.evals} />
    </div>
  );
}
