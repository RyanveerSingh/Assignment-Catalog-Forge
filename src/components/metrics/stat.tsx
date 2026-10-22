/** Small labelled figure for the cost and speed sections; a `dl` wraps a row of these. */
export function MiniStat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-sm bg-card px-4 py-3 hairline">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd className="mt-1 num text-xl leading-tight text-ink">{value}</dd>
      {hint ? <dd className="mt-0.5 text-xs text-ink-muted">{hint}</dd> : null}
    </div>
  );
}
