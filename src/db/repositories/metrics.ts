import { and, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { evalRuns, imports } from "@/db/schema";
import type { ModelUsage } from "@/core/metrics/cost-strategies";

export interface StoreMetrics {
  products: { total: number; byStatus: Record<string, number>; successRate: number; reviewRate: number; failureRate: number };
  imports: { total: number; completed: number; active: number; rowsProcessed: number; needsAttention: number };
  models: Array<{ model: string; purpose: string; calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; costMicros: number; avgLatencyMs: number; p95LatencyMs: number }>;
  costOverTime: Array<{ day: string; costMicros: number; calls: number }>;
  cost: { totalMicros: number; naiveMicros: number; savedMicros: number; perProductMicros: number; per1000Micros: number; cacheHitRate: number; batchedShare: number };
  speed: {
    avgRowsPerMinute: number | null;
    slowestImport: { id: string; name: string; rowsPerMinute: number } | null;
    fastestImport: { id: string; name: string; rowsPerMinute: number } | null;
    avgAiLatencyMs: number | null;
    p95AiLatencyMs: number | null;
    /** Wall-clock time from first row to last over completed imports; null until one has finished. */
    medianImportMs: number | null;
  };
  translations: Array<{ locale: string; products: number; fresh: number; outdated: number; failed: number; coverage: number }>;
  routing: Array<{ tier: string; products: number; costMicros: number }>;
  evals: Array<{ id: string; name: string; promptVersion: string; model: string; sample: string; metrics: Record<string, unknown>; createdAt: string }>;
  /** Succeeded calls per (model, batched) bucket; the cost-strategies table prices these four ways. */
  usage: ModelUsage[];
  /** Products that have an AI result, the denominator for "per 1,000 products". */
  productsThroughAi: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Everything the Metrics tab shows, computed from the tables of record. Cheap enough for a dashboard refresh. */
export async function getStoreMetrics(db: DbOrTx, storeId: string): Promise<StoreMetrics> {
  const statusRows = (await db.execute<{ status: string; n: string }>(sql`select status, count(*)::text as n from products where store_id = ${storeId} and deleted_at is null group by status`)).rows;
  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const r of statusRows) {
    byStatus[r.status] = Number(r.n);
    total += Number(r.n);
  }
  const decided = total - (byStatus.pending_ai ?? 0);
  const ok = (byStatus.draft ?? 0) + (byStatus.approved ?? 0);
  const review = byStatus.needs_review ?? 0;
  const failed = byStatus.failed ?? 0;

  const impRows = (
    await db.execute<{ status: string; n: string; rows: string }>(sql`select status, count(*)::text as n, coalesce(sum(total_rows),0)::text as rows from imports where store_id = ${storeId} group by status`)
  ).rows;
  const importsAgg = { total: 0, completed: 0, active: 0, rowsProcessed: 0, needsAttention: 0 };
  for (const r of impRows) {
    importsAgg.total += Number(r.n);
    if (r.status === "completed") {
      importsAgg.completed += Number(r.n);
      importsAgg.rowsProcessed += Number(r.rows);
    } else if (r.status === "needs_attention") importsAgg.needsAttention += Number(r.n);
    else if (!["failed", "cancelled"].includes(r.status)) importsAgg.active += Number(r.n);
  }

  const modelRows = (
    await db.execute<{ model: string; purpose: string; calls: string; input_tokens: string; output_tokens: string; cache_read: string; cost: string; avg_latency: string | null; p95_latency: string | null }>(sql`
      select model, purpose, count(*)::text as calls, sum(input_tokens)::text as input_tokens, sum(output_tokens)::text as output_tokens,
             sum(cache_read_tokens)::text as cache_read, sum(cost_micros)::text as cost,
             avg(latency_ms)::text as avg_latency, percentile_cont(0.95) within group (order by latency_ms)::text as p95_latency
        from ai_requests where store_id = ${storeId} and status = 'succeeded'
       group by model, purpose order by sum(cost_micros) desc
    `)
  ).rows;

  const costDays = (
    await db.execute<{ day: string; cost: string; calls: string }>(sql`
      select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, sum(cost_micros)::text as cost, count(*)::text as calls
        from ai_requests where store_id = ${storeId} and status = 'succeeded' and created_at > now() - interval '30 days'
       group by 1 order by 1
    `)
  ).rows;

  const [costAgg] = (
    await db.execute<{ total: string; naive: string; cached: string; batched: string; calls: string; latency_avg: string | null; latency_p95: string | null }>(sql`
      select coalesce(sum(cost_micros),0)::text as total,
             coalesce(sum(((input_tokens + cache_read_tokens + cache_write_tokens) * 2.0 + output_tokens * 10.0)), 0)::text as naive,
             coalesce(sum(case when cache_read_tokens > 0 then 1 else 0 end),0)::text as cached,
             coalesce(sum(case when batch_id is not null then 1 else 0 end),0)::text as batched,
             count(*)::text as calls,
             avg(latency_ms)::text as latency_avg,
             percentile_cont(0.95) within group (order by latency_ms)::text as latency_p95
        from ai_requests where store_id = ${storeId} and status = 'succeeded'
    `)
  ).rows;
  const totalMicros = Number(costAgg?.total ?? 0);
  // naive is expressed in token-dollars per million; convert to micros: tokens * $/MTok / 1e6 * 1e6
  const naiveMicros = Math.round(Number(costAgg?.naive ?? 0));
  const calls = Number(costAgg?.calls ?? 0);

  const speedRows = await db
    .select({ id: imports.id, name: imports.name, totalRows: imports.totalRows, startedAt: imports.startedAt, finishedAt: imports.finishedAt })
    .from(imports)
    .where(and(eq(imports.storeId, storeId), eq(imports.status, "completed")));
  const timed = speedRows.flatMap((r) => (r.startedAt && r.finishedAt && r.totalRows > 0 ? [{ id: r.id, name: r.name, totalRows: r.totalRows, ms: Math.max(1, r.finishedAt.getTime() - r.startedAt.getTime()) }] : []));
  const rates = timed.map((r) => ({ id: r.id, name: r.name, rowsPerMinute: Math.round((r.totalRows / r.ms) * 60_000) }));
  const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b.rowsPerMinute, 0) / rates.length) : null;
  const medianImportMs = median(timed.map((r) => r.ms));
  const slowest = rates.length ? rates.reduce((a, b) => (a.rowsPerMinute < b.rowsPerMinute ? a : b)) : null;
  const fastest = rates.length ? rates.reduce((a, b) => (a.rowsPerMinute > b.rowsPerMinute ? a : b)) : null;

  const translationRows = (
    await db.execute<{ locale: string; fresh: string; outdated: string; failed: string }>(sql`
      select t.locale,
             sum(case when t.status = 'fresh' then 1 else 0 end)::text as fresh,
             sum(case when t.status = 'outdated' then 1 else 0 end)::text as outdated,
             sum(case when t.status = 'failed' then 1 else 0 end)::text as failed
        from translations t join products p on p.id = t.product_id
       where p.store_id = ${storeId} and p.deleted_at is null and t.field = 'title'
       group by t.locale order by t.locale
    `)
  ).rows;
  const translatable = decided - failed;

  const routingRows = (
    await db.execute<{ tier: string; n: string; cost: string }>(sql`select coalesce(ai_tier,'unrouted') as tier, count(*)::text as n, coalesce(sum(ai_cost_micros),0)::text as cost from products where store_id = ${storeId} and deleted_at is null group by 1 order by 2 desc`)
  ).rows;

  const evals = await db.select().from(evalRuns).where(eq(evalRuns.storeId, storeId)).orderBy(sql`${evalRuns.createdAt} desc`).limit(20);

  // A response-cache hit is stored with `cachedFrom` and no tokens; the demo provider also bills zero, so cost alone is not the signal.
  const usageRows = (
    await db.execute<{ model: string; batched: boolean; calls: string; cached: string; input_tokens: string; output_tokens: string; cache_read: string; cache_write: string; cost: string }>(sql`
      select model, (batch_id is not null) as batched, count(*)::text as calls,
             count(*) filter (where response ? 'cachedFrom' or (input_tokens = 0 and output_tokens = 0 and cost_micros = 0))::text as cached,
             sum(input_tokens)::text as input_tokens, sum(output_tokens)::text as output_tokens,
             sum(cache_read_tokens)::text as cache_read, sum(cache_write_tokens)::text as cache_write, sum(cost_micros)::text as cost
        from ai_requests where store_id = ${storeId} and status = 'succeeded'
       group by 1, 2 order by 1, 2
    `)
  ).rows;
  const [throughAi] = (await db.execute<{ n: string }>(sql`select count(*)::text as n from products where store_id = ${storeId} and deleted_at is null and ai_model is not null`)).rows;

  return {
    products: {
      total,
      byStatus,
      successRate: decided ? ok / decided : 0,
      reviewRate: decided ? review / decided : 0,
      failureRate: decided ? failed / decided : 0,
    },
    imports: importsAgg,
    models: modelRows.map((r) => ({
      model: r.model,
      purpose: r.purpose,
      calls: Number(r.calls),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      cacheReadTokens: Number(r.cache_read),
      costMicros: Number(r.cost),
      avgLatencyMs: Math.round(Number(r.avg_latency ?? 0)),
      p95LatencyMs: Math.round(Number(r.p95_latency ?? 0)),
    })),
    costOverTime: costDays.map((r) => ({ day: r.day, costMicros: Number(r.cost), calls: Number(r.calls) })),
    cost: {
      totalMicros,
      naiveMicros,
      savedMicros: Math.max(0, naiveMicros - totalMicros),
      perProductMicros: decided ? Math.round(totalMicros / decided) : 0,
      per1000Micros: decided ? Math.round((totalMicros / decided) * 1000) : 0,
      cacheHitRate: calls ? Number(costAgg?.cached ?? 0) / calls : 0,
      batchedShare: calls ? Number(costAgg?.batched ?? 0) / calls : 0,
    },
    speed: {
      avgRowsPerMinute: avgRate,
      slowestImport: slowest,
      fastestImport: fastest,
      avgAiLatencyMs: costAgg?.latency_avg ? Math.round(Number(costAgg.latency_avg)) : null,
      p95AiLatencyMs: costAgg?.latency_p95 ? Math.round(Number(costAgg.latency_p95)) : null,
      medianImportMs,
    },
    translations: translationRows.map((r) => ({
      locale: r.locale,
      products: translatable,
      fresh: Number(r.fresh),
      outdated: Number(r.outdated),
      failed: Number(r.failed),
      coverage: translatable ? Math.min(1, (Number(r.fresh) + Number(r.outdated)) / translatable) : 0,
    })),
    routing: routingRows.map((r) => ({ tier: r.tier, products: Number(r.n), costMicros: Number(r.cost) })),
    evals: evals.map((e) => ({ id: e.id, name: e.name, promptVersion: e.promptVersion, model: e.model, sample: e.sample, metrics: e.metrics, createdAt: e.createdAt.toISOString() })),
    usage: usageRows.map((r) => ({
      model: r.model,
      batched: r.batched === true,
      calls: Number(r.calls),
      cachedCalls: Number(r.cached),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      cacheReadTokens: Number(r.cache_read),
      cacheWriteTokens: Number(r.cache_write),
      costMicros: Number(r.cost),
    })),
    productsThroughAi: Number(throughAi?.n ?? 0),
  };
}
