import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/db/client";
import type { HygieneCounts } from "@/core/metrics/hygiene";

/**
 * Counts for the import page's data-hygiene flow, each taken from the table that holds the fact:
 * rows and their cleaning issues from `import_rows`, products and claims from `products`, cache hits
 * from `ai_requests`, blocked claims from the grounding events. Nothing here is derived from the
 * import's own counters, so the flow always agrees with what a query would show.
 */

const n = (v: string | null | undefined): number => {
  const parsed = Number(v ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** A row flagged by the cleaner carries at least one warning or error. */
const FLAGGED = sql`(issues @> '[{"severity":"warn"}]'::jsonb or issues @> '[{"severity":"error"}]'::jsonb)`;

async function rowCounts(db: DbOrTx, storeId: string, importId: string): Promise<HygieneCounts["rows"]> {
  const [r] = (
    await db.execute<{ parsed: string; duplicates: string; cleaned: string; clean: string; repaired: string; flagged: string; priced: string; weighed: string; dimensioned: string; measured: string }>(sql`
      select count(*)::text as parsed,
             count(*) filter (where duplicate_of_row is not null)::text as duplicates,
             count(*) filter (where cleaned is not null)::text as cleaned,
             count(*) filter (where cleaned is not null and jsonb_array_length(issues) = 0)::text as clean,
             count(*) filter (where cleaned is not null and jsonb_array_length(issues) > 0 and not ${FLAGGED})::text as repaired,
             count(*) filter (where cleaned is not null and ${FLAGGED})::text as flagged,
             count(*) filter (where jsonb_typeof(cleaned->'price'->'money'->'cents') = 'number')::text as priced,
             count(*) filter (where jsonb_typeof(cleaned->'weightGrams') = 'number')::text as weighed,
             count(*) filter (where jsonb_typeof(cleaned->'dimensions') = 'object')::text as dimensioned,
             count(*) filter (where jsonb_typeof(cleaned->'weightGrams') = 'number' or jsonb_typeof(cleaned->'dimensions') = 'object')::text as measured
        from import_rows
       where store_id = ${storeId} and import_id = ${importId}
    `)
  ).rows;
  return {
    parsed: n(r?.parsed),
    duplicates: n(r?.duplicates),
    cleaned: n(r?.cleaned),
    clean: n(r?.clean),
    repaired: n(r?.repaired),
    flagged: n(r?.flagged),
    priced: n(r?.priced),
    weighed: n(r?.weighed),
    dimensioned: n(r?.dimensioned),
    measured: n(r?.measured),
  };
}

/** Rows carrying each issue code at least once (a row with two mojibake fields counts once). */
async function codeCounts(db: DbOrTx, storeId: string, importId: string): Promise<Record<string, number>> {
  const rows = (
    await db.execute<{ code: string | null; rows: string }>(sql`
      select e->>'code' as code, count(distinct r.id)::text as rows
        from import_rows r cross join lateral jsonb_array_elements(r.issues) as e
       where r.store_id = ${storeId} and r.import_id = ${importId}
       group by 1
    `)
  ).rows;
  const out: Record<string, number> = {};
  for (const r of rows) if (r.code) out[r.code] = n(r.rows);
  return out;
}

const CONFLICT = sql`(jsonb_typeof(group_data->'conflicts') = 'array' and jsonb_array_length(group_data->'conflicts') > 0)`;
const POSSIBLE_DUPLICATE = sql`(jsonb_typeof(group_data->'issues') = 'array' and group_data->'issues' @> '[{"code":"product.possible_duplicate"}]'::jsonb)`;

async function productCounts(db: DbOrTx, storeId: string, importId: string): Promise<HygieneCounts["products"]> {
  const rows = (
    await db.execute<{ tier: string; status: string; n: string; conflicts: string; possible_duplicates: string; either: string; claims: string }>(sql`
      select coalesce(ai_tier, 'unrouted') as tier, status, count(*)::text as n,
             count(*) filter (where ${CONFLICT})::text as conflicts,
             count(*) filter (where ${POSSIBLE_DUPLICATE})::text as possible_duplicates,
             count(*) filter (where ${CONFLICT} or ${POSSIBLE_DUPLICATE})::text as either,
             coalesce(sum(case when jsonb_typeof(claims) = 'array' then jsonb_array_length(claims) else 0 end), 0)::text as claims
        from products
       where store_id = ${storeId} and last_import_id = ${importId} and deleted_at is null
       group by 1, 2
    `)
  ).rows;
  const [variants] = (
    await db.execute<{ n: string }>(sql`
      select count(*)::text as n
        from variants v join products p on p.id = v.product_id
       where v.store_id = ${storeId} and p.store_id = ${storeId} and p.last_import_id = ${importId} and p.deleted_at is null
    `)
  ).rows;
  const out: HygieneCounts["products"] = { total: 0, variants: n(variants?.n), conflicts: 0, possibleDuplicates: 0, conflictsOrDuplicates: 0, byTier: {}, byStatus: {}, claims: 0 };
  for (const r of rows) {
    const count = n(r.n);
    out.total += count;
    out.byTier[r.tier] = (out.byTier[r.tier] ?? 0) + count;
    out.byStatus[r.status] = (out.byStatus[r.status] ?? 0) + count;
    out.conflicts += n(r.conflicts);
    out.possibleDuplicates += n(r.possible_duplicates);
    out.conflictsOrDuplicates += n(r.either);
    out.claims += n(r.claims);
  }
  return out;
}

/**
 * Writing-stage calls only; translations keep their own cache table. A response-cache hit is
 * recorded with `cachedFrom`; the demo provider also bills zero, so cost alone is not the signal.
 */
async function aiCounts(db: DbOrTx, storeId: string, importId: string): Promise<HygieneCounts["ai"]> {
  const [r] = (
    await db.execute<{ calls: string; cached: string }>(sql`
      select count(*)::text as calls,
             count(*) filter (where response ? 'cachedFrom' or (input_tokens = 0 and output_tokens = 0 and cost_micros = 0))::text as cached
        from ai_requests
       where store_id = ${storeId} and import_id = ${importId} and status = 'succeeded' and purpose in ('enrich', 'vision', 'repair')
    `)
  ).rows;
  return { calls: n(r?.calls), cached: n(r?.cached) };
}

let guardrailsColumn: boolean | null = null;

/** Whether products carry a `guardrails` column (added after the first imports ran); checked once per process. */
async function hasGuardrailsColumn(db: DbOrTx): Promise<boolean> {
  if (guardrailsColumn === null) {
    const r = await db.execute(sql`select 1 from information_schema.columns where table_name = 'products' and column_name = 'guardrails' limit 1`);
    guardrailsColumn = r.rows.length > 0;
  }
  return guardrailsColumn;
}

/** Blocked claims stored on the products themselves; zero for products written before the column existed. */
async function guardrailCount(db: DbOrTx, storeId: string, importId: string): Promise<number> {
  if (!(await hasGuardrailsColumn(db))) return 0;
  const [r] = (
    await db.execute<{ blocked: string }>(sql`
      select coalesce(sum(case when jsonb_typeof(guardrails) = 'array' then jsonb_array_length(guardrails) else 0 end), 0)::text as blocked
        from products
       where store_id = ${storeId} and last_import_id = ${importId} and deleted_at is null
    `)
  ).rows;
  return n(r?.blocked);
}

/** Blocked claims as the grounding stage logged them: the event payload when present, else the number in the message. */
async function loggedRemovals(db: DbOrTx, storeId: string, importId: string): Promise<number> {
  const [r] = (
    await db.execute<{ blocked: string }>(sql`
      select coalesce(sum(case
               when jsonb_typeof(e.data->'removed') = 'array' then jsonb_array_length(e.data->'removed')
               when jsonb_typeof(e.data->'blocked') = 'array' then jsonb_array_length(e.data->'blocked')
               else coalesce(nullif(substring(e.message from '^Removed (\\d+)'), '')::int, 0)
             end), 0)::text as blocked
        from import_events e join imports i on i.id = e.import_id
       where i.store_id = ${storeId} and e.import_id = ${importId} and e.message like 'Removed %'
    `)
  ).rows;
  return n(r?.blocked);
}

/**
 * Claims the grounding validator kept out of listings. Older imports only have the log events, newer
 * ones carry the guardrails on the product (and may still log), so the larger of the two is the count.
 */
async function blockedClaims(db: DbOrTx, storeId: string, importId: string): Promise<number> {
  const [stored, logged] = await Promise.all([guardrailCount(db, storeId, importId), loggedRemovals(db, storeId, importId)]);
  return Math.max(stored, logged);
}

export async function getImportHygiene(db: DbOrTx, storeId: string, importId: string): Promise<HygieneCounts> {
  const [rows, codes, products, ai, claimsBlocked] = await Promise.all([
    rowCounts(db, storeId, importId),
    codeCounts(db, storeId, importId),
    productCounts(db, storeId, importId),
    aiCounts(db, storeId, importId),
    blockedClaims(db, storeId, importId),
  ]);
  return { rows, codes, products, ai, claimsBlocked };
}
