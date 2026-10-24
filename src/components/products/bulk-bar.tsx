"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { spring } from "@/components/ext/motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { BulkRerunPopover } from "./products-toolbar";
import type { RerunSettings } from "./types";

type BulkAction = "approve" | "rerun";

/**
 * The selection's action bar: a brand-colour pill that springs up from the bottom centre of the screen when
 * rows are selected and drops away when the selection clears. Sits above the phone tab bar.
 */
export function BulkBar({ count, needsReview, includeNeedsReview, busy, onIncludeChange, onApprove, onRerun, onClear }: { count: number; needsReview: number; includeNeedsReview: boolean; busy: BulkAction | null; onIncludeChange: (v: boolean) => void; onApprove: () => void; onRerun: (s: RerunSettings) => Promise<boolean>; onClear: () => void }) {
  const reduce = useReducedMotion();
  const approving = count - (includeNeedsReview ? 0 : needsReview);
  return (
    <AnimatePresence>
      {count > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4 lg:bottom-6">
          <motion.div
            key="bulk"
            role="region"
            aria-label="Bulk actions"
            initial={{ opacity: 0, y: 28, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.96, transition: reduce ? { duration: 0 } : { duration: 0.18 } }}
            transition={spring(reduce)}
            className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-full bg-brand py-2 pr-2 pl-4 text-white shadow-[var(--shadow-float)] ring-1 ring-white/15"
          >
            <span className="num text-[13px] font-semibold whitespace-nowrap">
              {count} selected
            </span>
            {needsReview > 0 ? (
              <Label className="flex h-9 cursor-pointer items-center gap-2 rounded-full bg-white/15 px-3 text-xs font-normal text-white">
                <Checkbox checked={includeNeedsReview} onCheckedChange={(c) => onIncludeChange(c)} className="cursor-pointer border-white/50 data-checked:border-white data-checked:bg-white data-checked:text-brand" />
                Include {needsReview} that {needsReview === 1 ? "needs" : "need"} review
              </Label>
            ) : null}
            <Button type="button" size="sm" disabled={busy !== null} onClick={onApprove} className="h-9 cursor-pointer rounded-full bg-white px-4 text-brand shadow-none hover:bg-brand-soft hover:text-brand-strong">
              {busy === "approve" ? "Approving…" : `Approve ${approving}`}
            </Button>
            <BulkRerunPopover count={count} busy={busy === "rerun"} disabled={busy !== null} onQueue={onRerun} className="h-9 rounded-full border-0 bg-white/15 px-4 text-white shadow-none hover:bg-white/25 hover:text-white" />
            <button type="button" disabled={busy !== null} onClick={onClear} className="h-9 cursor-pointer rounded-full px-3 text-xs font-medium text-white/80 transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none disabled:opacity-50">
              Clear
            </button>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
