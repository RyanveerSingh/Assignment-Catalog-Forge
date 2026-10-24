"use client";

import { type LucideIcon, XIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { settle } from "@/components/ext/motion";

const MB = 1024 * 1024;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${Math.round(n / 1024)} KB`;
  return `${(n / MB).toFixed(1)} MB`;
}

interface FileRowProps {
  icon: LucideIcon;
  label: string;
  name: string;
  /** Position in the list, for the entrance stagger. */
  index: number;
  /** Bytes for a file; a link has none and shows `detail` instead. */
  size?: number;
  detail?: string;
  disabled: boolean;
  onRemove: () => void;
}

/**
 * One line of the "Selected files" list in the upload panel: a sheet, a dump, a photo, a ZIP or a
 * Google Sheets link. Rows slide in as they are added (a dropped batch arrives as a short cascade)
 * and the rows below a removed one close the gap with a transform rather than a jump.
 */
export function FileRow({ icon: Icon, label, name, index, size, detail, disabled, onRemove }: FileRowProps) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      layout={reduce ? false : "position"}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10, transition: settle(reduce, 0.12) }}
      transition={settle(reduce, 0.22, Math.min(index, 8) * 0.03)}
      className="flex min-h-11 items-center gap-3 px-3 py-1.5"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="w-10 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink" title={name}>
        {name}
      </span>
      <span className="num shrink-0 text-xs text-ink-muted">{size !== undefined ? formatBytes(size) : detail}</span>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        disabled={disabled}
        onClick={onRemove}
        className="flex size-8 cursor-pointer items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <XIcon className="size-3.5" aria-hidden />
      </button>
    </motion.li>
  );
}
