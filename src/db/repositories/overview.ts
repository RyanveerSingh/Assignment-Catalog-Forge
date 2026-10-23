import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import { ACTIVE_IMPORT_STATUSES, PRODUCT_STATUSES, type ImportCounts, type ImportStatus, type ProductStatus } from "@/db/schema";
import { dailySeries, sumLast } from "./overview-series";

/** Days drawn in each sparkline. */
export const OVERVIEW_SERIES_DAYS = 14;

export type ProductStatusCounts = Record<ProductStatus, number>;

export interface LiveImport {
  id: string;
  name: string;
  status: ImportStatus;
  totalRows: number;
  /** Rows that reached done, needs_review or failed. */
  finished: number;
}

export interface StoreOverview {
  products: {
    /** Status approved: what the shop serves. */
    live: number;
    needsReview: number;
    approvedLast7: number;
    flaggedLast7: number;
    liveSeries: number[];
    reviewSeries: number[];
  };
  imports: {
    last7: number;
    previous7: number;
    rowsLast7: number;
    series: number[];
  };
  ai: {
    spendMicros30d: number;
    spendMicros7d: number;
    series: number[];
  };
  live: LiveImport | null;
}

/**
 * Products per status, every status present (0 when none). One index scan of
 * products_store_status_idx; used by the products page strip and the upload overview.
 */
export async function countProductsByStatus(db: DbOrTx, storeId: string): Promise<ProductStatusCounts> {
  const result = await db.execute<{ status: ProductStatus; n: string }>(sql`
    select status, count(*)::text as n from products where store_id = ${storeId} and deleted_at is null group by status
  `);
  const counts = Object.fromEntries(PRODUCT_STATUSES.map((s) => [s, 0])) as ProductStatusCounts;
  for (const r of result.rows) counts[r.status] = Number(r.n);
  return counts;
}

/** The newest import the worker still owns, if any. Served by the partial index on active statuses. */
export async function findLiveImport(db: DbOrTx, storeId: string): Promise<LiveImport | null> {
  const result = await db.execute<{ id: string; name: string; status: ImportStatus; total_rows: number; counts: ImportCounts }>(sql`
    select id, name, status, total_rows, counts from imports
     where store_id = ${storeId} and status in ${ACTIVE_IMPORT_STATUSES}
     order by created_at desc limit 1
  `);
  const row = result.rows[0];
  if (!row) return null;
  return { id: row.id, name: row.name, status: row.status, totalRows: row.total_rows, finished: row.counts.done + row.counts.needs_review + row.counts.failed };
}

/**
 * The figures on the upload page's overview band. Four index-bounded queries (store + status,
 * store + created_at), each grouped by UTC day so the sparklines come from the same scan as the
 * counts. `nowMs` is the client-independent clock the series are bucketed against.
 */
export async function getStoreOverview(db: DbOrTx, storeId: string, nowMs = Date.now()): Promise<StoreOverview> {
  const [statusCounts, productDays, importDays, aiDays, live] = await Promise.all([
    countProductsByStatus(db, storeId),
    // Approved products are dated by approval, flagged ones by the update that flagged them.
    db.execute<{ status: ProductStatus; day: string; n: string }>(sql`
      select status,
             to_char((case when status = 'approved' then approved_at else updated_at end) at time zone 'UTC', 'YYYY-MM-DD') as day,
             count(*)::text as n
        from products
       where store_id = ${storeId} and deleted_at is null and status in ('approved', 'needs_review')
         and (case when status = 'approved' then approved_at else updated_at end) > now() - interval '14 days'
       group by 1, 2
    `),
    db.execute<{ day: string; n: string; rows: string }>(sql`
      select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day, count(*)::text as n, coalesce(sum(total_rows), 0)::text as rows
        from imports where store_id = ${storeId} and created_at > now() - interval '14 days'
       group by 1
    `),
    db.execute<{ day: string; micros: string }>(sql`
      select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as day, coalesce(sum(cost_micros), 0)::text as micros
        from ai_requests where store_id = ${storeId} and created_at > now() - interval '30 days'
       group by 1
    `),
    findLiveImport(db, storeId),
  ]);

  const liveSeries = dailySeries(
    productDays.rows.filter((r) => r.status === "approved").map((r) => ({ day: r.day, value: Number(r.n) })),
    nowMs,
    OVERVIEW_SERIES_DAYS,
  );
  const reviewSeries = dailySeries(
    productDays.rows.filter((r) => r.status === "needs_review").map((r) => ({ day: r.day, value: Number(r.n) })),
    nowMs,
    OVERVIEW_SERIES_DAYS,
  );
  const importSeries = dailySeries(
    importDays.rows.map((r) => ({ day: r.day, value: Number(r.n) })),
    nowMs,
    OVERVIEW_SERIES_DAYS,
  );
  const importRowSeries = dailySeries(
    importDays.rows.map((r) => ({ day: r.day, value: Number(r.rows) })),
    nowMs,
    OVERVIEW_SERIES_DAYS,
  );
  const aiSeries30 = dailySeries(
    aiDays.rows.map((r) => ({ day: r.day, value: Number(r.micros) })),
    nowMs,
    30,
  );

  return {
    products: {
      live: statusCounts.approved,
      needsReview: statusCounts.needs_review,
      approvedLast7: sumLast(liveSeries, 7),
      flaggedLast7: sumLast(reviewSeries, 7),
      liveSeries,
      reviewSeries,
    },
    imports: {
      last7: sumLast(importSeries, 7),
      previous7: sumLast(importSeries, 14) - sumLast(importSeries, 7),
      rowsLast7: sumLast(importRowSeries, 7),
      series: importSeries,
    },
    ai: {
      spendMicros30d: sumLast(aiSeries30, 30),
      spendMicros7d: sumLast(aiSeries30, 7),
      series: aiSeries30.slice(-OVERVIEW_SERIES_DAYS),
    },
    live,
  };
}
