import { cn } from "cn";

export function confidenceTone(score: number | null | undefined): "high" | "mid" | "low" | "none" {
  if (score === null || score === undefined) return "none";
  if (score >= 85) return "high";
  if (score >= 60) return "mid";
  return "low";
}

const TONE_CLASS = {
  high: "border-success text-success",
  mid: "border-warning text-warning",
  low: "border-destructive text-destructive",
  none: "border-border text-ink-muted",
} as const;

/**
 * Confidence as a monospace number with a coloured left rule (green ≥ 85, amber 60–84, red < 60).
 * The number is always shown so colour is never the only signal.
 */
export function ConfidenceChip({ score, label, className, size = "sm" }: { score: number | null | undefined; label?: string; className?: string; size?: "sm" | "md" }) {
  const tone = confidenceTone(score);
  return (
    <span
      title={label ? `${label}: ${score ?? "n/a"}%` : undefined}
      className={cn("inline-flex items-center gap-1 border-l-[3px] bg-card pl-1.5 pr-1 num leading-none", size === "sm" ? "h-5 text-[11px]" : "h-6 text-xs", TONE_CLASS[tone], className)}
    >
      {label ? <span className="font-sans text-[10px] uppercase tracking-wide text-ink-muted">{label}</span> : null}
      <span>{score === null || score === undefined ? "—" : score}</span>
    </span>
  );
}
