/**
 * Daily bucketing for the dashboard sparklines. Pure: the repository buckets rows by UTC day in SQL
 * (`at time zone 'UTC'`) and these helpers turn that sparse list into a dense, oldest-first series.
 */

const DAY_MS = 86_400_000;

export interface DayValue {
  /** `YYYY-MM-DD` in UTC, as `to_char(ts at time zone 'UTC', 'YYYY-MM-DD')` prints it. */
  day: string;
  value: number;
}

/** The UTC calendar day of an instant, in the same `YYYY-MM-DD` form the SQL side produces. */
export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * `days` values ending on the UTC day of `nowMs`, oldest first. Days without a row read 0, rows on
 * the same day add up and rows outside the window are dropped, so a stale row can never shift the line.
 */
export function dailySeries(rows: ReadonlyArray<DayValue>, nowMs: number, days: number): number[] {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const v = Number.isFinite(r.value) ? r.value : 0;
    byDay.set(r.day, (byDay.get(r.day) ?? 0) + v);
  }
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(byDay.get(utcDayKey(nowMs - i * DAY_MS)) ?? 0);
  return out;
}

/** Sum of the newest `n` entries (the whole series when `n` exceeds it; 0 for `n <= 0`). */
export function sumLast(series: ReadonlyArray<number>, n: number): number {
  if (n <= 0) return 0;
  let total = 0;
  for (const v of series.slice(-n)) total += v;
  return total;
}
