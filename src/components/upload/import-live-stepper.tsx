"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { settle } from "@/components/ext/motion";
import { CARD } from "@/components/ext/surfaces";
import { PIPELINE_STEPS, STATE_TEXT, sideState, StepGlyph, stepIndexFor, type StepState } from "./stage-stepper";

const DOT: Record<StepState, string> = {
  done: "bg-brand text-brand-foreground ring-brand",
  current: "bg-card text-brand ring-brand shadow-[0_0_0_6px_var(--brand-soft)]",
  upcoming: "bg-card text-ink-muted ring-border",
  paused: "bg-warning-soft text-warning ring-warning",
  attention: "bg-warning-soft text-warning ring-warning",
  failed: "bg-destructive/10 text-destructive ring-destructive",
  cancelled: "bg-surface-2 text-ink-muted ring-line-strong",
};

/**
 * The pipeline as a rail: a track between the first and last stage with a fill that eases to
 * the current stage, and a dot with a label for each stage. `initial={false}` means an import opened
 * when already half done renders settled, with no replay. Side states (paused, failed, …) sit on the
 * last pipeline stage the client saw (`lastStage`).
 */
export function LiveStageStepper({ status, lastStage }: { status: string; lastStage: string | null }) {
  const reduce = useReducedMotion();
  const side = sideState(status);
  const currentIdx = side ? (lastStage ? stepIndexFor(lastStage) : -1) : stepIndexFor(status);
  const allDone = status === "completed";
  const n = PIPELINE_STEPS.length;
  const fill = allDone ? 1 : currentIdx <= 0 ? 0 : currentIdx / (n - 1);
  const edge = `${100 / (n * 2)}%`;

  return (
    <div className={cn(CARD, "overflow-x-auto px-4 py-5 no-scrollbar max-md:[mask-image:linear-gradient(to_right,black_88%,transparent)] md:px-6")}>
      <div className="relative min-w-[640px]">
        <div aria-hidden className="absolute top-3.5 h-1 rounded-full bg-surface-2" style={{ left: edge, right: edge }}>
          <motion.div className="h-full w-full origin-left rounded-full bg-brand" initial={false} animate={{ scaleX: fill }} transition={settle(reduce, 0.6)} />
        </div>
        <ol aria-label="Pipeline stages" className="relative grid text-xs" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {PIPELINE_STEPS.map((step, i) => {
            let state: StepState;
            if (allDone) state = "done";
            else if (currentIdx < 0) state = "upcoming";
            else if (i < currentIdx) state = "done";
            else if (i === currentIdx) state = side ?? "current";
            else state = "upcoming";
            return (
              <li key={step.key} className="flex flex-col items-center gap-2" aria-current={state === "current" ? "step" : undefined}>
                <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-inset transition-colors duration-300", DOT[state])}>
                  <StepGlyph state={state} index={i} />
                </span>
                <span className={cn("whitespace-nowrap transition-colors duration-300", state === "upcoming" ? "text-ink-muted" : "text-ink", (state === "current" || side) && i === currentIdx && "font-semibold")}>
                  {step.label}
                  <span className="sr-only">, {STATE_TEXT[state]}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
