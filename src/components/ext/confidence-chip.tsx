import { cn } from "cn";

export function confidenceTone(score: number | null | undefined): "high" | "mid" | "low" | "none" {
  if (score === null || score === undefined) return "none";
  if (score >= 85) return "high";
  if (score >= 60) return "mid";
  return "low";
}

const TONE_TEXT = { high: "text-success", mid: "text-warning", low: "text-destructive", none: "text-ink-muted" } as const;
const TONE_BAR = { high: "bg-success", mid: "bg-warning", low: "bg-destructive", none: "bg-ink/20" } as const;

/**
 * Confidence as a tabular number with a short meter beside it (green ≥ 85, amber 60–84, red < 60).
 * The number is always shown so colour is never the only signal; the meter fills by a transform so
 * the chip's width is the same whatever the score.
 */
export function ConfidenceChip({ score, label, className, size = "sm", bar = false }: { score: number | null | undefined; label?: string; className?: string; size?: "sm" | "md"; bar?: boolean }) {
  const tone = confidenceTone(score);
  const fill = score === null || score === undefined ? 0 : Math.min(100, Math.max(0, score)) / 100;
  return (
    <span title={label ? `${label}: ${score ?? "n/a"}%` : undefined} className={cn("inline-flex items-center gap-2 leading-none", size === "sm" ? "text-xs" : "text-sm", className)}>
      {label ? <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</span> : null}
      <span className={cn("num min-w-[2ch] text-right font-semibold", TONE_TEXT[tone])}>{score === null || score === undefined ? "—" : score}</span>
      {bar ? (
        <span aria-hidden className="relative h-1.5 w-12 overflow-hidden rounded-full bg-surface-2">
          <span className={cn("absolute inset-0 origin-left rounded-full", TONE_BAR[tone])} style={{ transform: `scaleX(${fill})` }} />
        </span>
      ) : null}
    </span>
  );
}
