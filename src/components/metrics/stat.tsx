import { cn } from "cn";
import { CARD } from "@/components/ext/surfaces";

/** Small labelled figure for the cost and speed sections, as a raised card; a `dl` wraps a row of these. */
export function MiniStat({ label, value, hint, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <div className={cn(CARD, "flex flex-col px-5 py-4", className)}>
      <dt className="text-[12px] font-medium text-ink-muted">{label}</dt>
      <dd className="mt-1.5 font-display text-[1.5rem] leading-tight text-ink tabular">{value}</dd>
      {hint ? <dd className="mt-1 text-xs text-ink-muted">{hint}</dd> : null}
    </div>
  );
}
