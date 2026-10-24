import { BanIcon, CheckIcon, PauseIcon, TriangleAlertIcon, XIcon } from "lucide-react";

interface PipelineStep {
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

export type StepState = "done" | "current" | "upcoming" | "paused" | "attention" | "failed" | "cancelled";

export const STATE_TEXT: Record<StepState, string> = {
  done: "completed",
  current: "in progress",
  upcoming: "not started",
  paused: "paused here",
  attention: "needs attention here",
  failed: "failed here",
  cancelled: "cancelled here",
};

/** Statuses drawn on the last stage the client saw rather than as a stage of their own. */
export function sideState(status: string): StepState | null {
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

export function StepGlyph({ state, index }: { state: StepState; index: number }) {
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
