import { cn } from "cn";

/** Large-number tile for the metrics page and import headers. */
export function Kpi({ label, value, hint, tone = "neutral", className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "neutral" | "brand" | "success" | "warning" | "danger"; className?: string }) {
  const rule = { neutral: "border-ink/20", brand: "border-brand", success: "border-success", warning: "border-warning", danger: "border-destructive" }[tone];
  return (
    <div className={cn("flex flex-col gap-1 border-t-2 bg-card px-4 py-3 hairline", rule, className)}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="font-display text-3xl leading-none text-ink tabular">{value}</div>
      {hint ? <div className="text-xs text-ink-muted">{hint}</div> : null}
    </div>
  );
}
