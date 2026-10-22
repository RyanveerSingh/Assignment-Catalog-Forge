import { BanIcon, CheckIcon, PauseIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { cn } from "cn";

export interface PipelineStep {
  key: string;
  label: string;
  /** Import statuses that mean "this step is running". */
  statuses: readonly string[];
}

/** The pipeline in order. `validating` is folded into "Writing" because it is the same AI pass from the merchant's view. */
export const PIPELINE_STEPS: readonly PipelineStep[] = [
  { key: "queued", label: "Queued", statuses: ["uploading", "queued"] },
  { key: "parsing", label: "Parsing", statuses: ["parsing"] },
  { key: "cleaning", label: "Cleaning", statuses: ["cleaning"] },
  { key: "grouping", label: "Grouping", statuses: ["grouping"] },
  { key: "enriching", label: "Writing", statuses: ["enriching", "validating"] },
  { key: "translating", label: "Translating", statuses: ["translating"] },
  { key: "finalizing", label: "Finalizing", statuses: ["finalizing"] },
  { key: "completed", label: "Done", statuses: ["completed"] },
];

/** Statuses that sit beside the pipeline rather than on it. */
export const SIDE_STATES: ReadonlySet<string> = new Set(["paused", "needs_attention", "failed", "cancelled"]);

/** Index of the step a pipeline status belongs to, or -1 for side states and unknown values. */
export function stepIndexFor(status: string): number {
  return PIPELINE_STEPS.findIndex((s) => s.statuses.includes(status));
}

/** True while the worker still owns the import (including automatic or manual pauses). */
export function isImportActive(status: string): boolean {
  if (status === "paused") return true;
  const idx = stepIndexFor(status);
  return idx >= 0 && idx < PIPELINE_STEPS.length - 1;
}

type StepState = "done" | "current" | "upcoming" | "paused" | "attention" | "failed" | "cancelled";

const STATE_CLASS: Record<StepState, string> = {
  done: "bg-success-soft text-success ring-success/40",
  current: "bg-brand text-brand-foreground ring-brand",
  upcoming: "bg-card text-ink-muted ring-border",
  paused: "bg-warning-soft text-warning ring-warning/50",
  attention: "bg-warning-soft text-warning ring-warning/50",
  failed: "bg-destructive/10 text-destructive ring-destructive/50",
  cancelled: "bg-muted text-ink-muted ring-border",
};

const STATE_TEXT: Record<StepState, string> = {
  done: "completed",
  current: "in progress",
  upcoming: "not started",
  paused: "paused here",
  attention: "needs attention here",
  failed: "failed here",
  cancelled: "cancelled here",
};

function sideState(status: string): StepState | null {
  switch (status) {
    case "paused":
      return "paused";
    case "needs_attention":
      return "attention";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return null;
  }
}

function StepGlyph({ state, index }: { state: StepState; index: number }) {
  const icon = "size-3";
  switch (state) {
    case "done":
      return <CheckIcon className={icon} aria-hidden />;
    case "current":
      return <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-current" />;
    case "paused":
      return <PauseIcon className={icon} aria-hidden />;
    case "attention":
      return <TriangleAlertIcon className={icon} aria-hidden />;
    case "failed":
      return <XIcon className={icon} aria-hidden />;
    case "cancelled":
      return <BanIcon className={icon} aria-hidden />;
    default:
      return <span aria-hidden>{index + 1}</span>;
  }
}

/**
 * Horizontal pipeline stepper. Side states (paused, failed, …) are drawn on the last pipeline stage
 * the client saw (`lastStage`); when that is unknown the whole row reads as not started.
 */
export function StageStepper({ status, lastStage, className }: { status: string; lastStage: string | null; className?: string }) {
  const side = sideState(status);
  const currentIdx = side ? (lastStage ? stepIndexFor(lastStage) : -1) : stepIndexFor(status);
  const allDone = status === "completed";

  return (
    <ol aria-label="Pipeline stages" className={cn("flex flex-wrap items-center gap-y-2 text-xs", className)}>
      {PIPELINE_STEPS.map((step, i) => {
        let state: StepState;
        if (allDone) state = "done";
        else if (currentIdx < 0) state = "upcoming";
        else if (i < currentIdx) state = "done";
        else if (i === currentIdx) state = side ?? "current";
        else state = "upcoming";
        const isLast = i === PIPELINE_STEPS.length - 1;
        return (
          <li key={step.key} className="flex items-center" aria-current={state === "current" ? "step" : undefined}>
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ring-1 ring-inset", STATE_CLASS[state])}>
              <StepGlyph state={state} index={i} />
            </span>
            <span className={cn("ml-1.5", state === "upcoming" ? "text-ink-muted" : "text-ink", state === "current" && "font-medium")}>
              {step.label}
              <span className="sr-only">, {STATE_TEXT[state]}</span>
            </span>
            {isLast ? null : <span aria-hidden className={cn("mx-2 h-px w-3 sm:w-5", state === "done" ? "bg-success/50" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}
