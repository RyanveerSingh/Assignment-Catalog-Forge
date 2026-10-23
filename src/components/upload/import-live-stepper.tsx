"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { settle } from "@/components/ext/motion";
import { PIPELINE_STEPS, STATE_CLASS, STATE_TEXT, sideState, StepGlyph, stepIndexFor, type StepState } from "./stage-stepper";

/**
 * The pipeline stepper for the live import page. Each connector is drawn left to right as its
 * stage completes, so a watcher sees progress travel along the row.
 * `initial={false}` means an import opened when already half done renders settled, with no replay.
 * Side states (paused, failed, …) sit on the last pipeline stage the client saw (`lastStage`).
 */
export function LiveStageStepper({ status, lastStage, className }: { status: string; lastStage: string | null; className?: string }) {
  const reduce = useReducedMotion();
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
        else if (i === currentIdx) state = (side ?? "current");
        else state = "upcoming";
        const isLast = i === PIPELINE_STEPS.length - 1;
        return (
          <li key={step.key} className="flex items-center" aria-current={state === "current" ? "step" : undefined}>
            <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ring-1 ring-inset transition-colors duration-300", STATE_CLASS[state])}>
              <StepGlyph state={state} index={i} />
            </span>
            <span className={cn("ml-1.5 transition-colors duration-300", state === "upcoming" ? "text-ink-muted" : "text-ink", state === "current" && "font-medium")}>
              {step.label}
              <span className="sr-only">, {STATE_TEXT[state]}</span>
            </span>
            {isLast ? null : (
              <span aria-hidden className="relative mx-2 h-px w-3 overflow-hidden bg-border sm:w-5">
                <motion.span className="absolute inset-0 origin-left bg-success/60" initial={false} animate={{ scaleX: state === "done" ? 1 : 0 }} transition={settle(reduce, 0.4, 0.1)} />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
