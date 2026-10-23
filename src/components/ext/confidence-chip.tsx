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
 * The number is always shown so colour is never the only signal. `bar` adds a short meter beside it,
 * filled by a transform so the chip's width is the same whatever the score.
 */
export function ConfidenceChip({ score, label, className, size = "sm", bar = false }: { score: number | null | undefined; label?: string; className?: string; size?: "sm" | "md"; bar?: boolean }) {
  const tone = confidenceTone(score);
  const fill = score === null || score === undefined ? 0 : Math.min(100, Math.max(0, score)) / 100;
  return (
    <span
      title={label ? `${label}: ${score ?? "n/a"}%` : undefined}
      className={cn("inline-flex items-center gap-1.5 border-l-[3px] bg-card pl-1.5 pr-1.5 num leading-none", size === "sm" ? "h-5 text-[11px]" : "h-6 text-xs", TONE_CLASS[tone], className)}
    >
      {label ? <span className="font-sans text-[10px] uppercase tracking-wide text-ink-muted">{label}</span> : null}
      <span className="min-w-[2ch] text-right">{score === null || score === undefined ? "—" : score}</span>
      {bar ? (
        <span aria-hidden className="relative h-1 w-9 overflow-hidden rounded-full bg-current/15">
          <span className="absolute inset-0 origin-left rounded-full bg-current" style={{ transform: `scaleX(${fill})` }} />
        </span>
      ) : null}
    </span>
  );
}
