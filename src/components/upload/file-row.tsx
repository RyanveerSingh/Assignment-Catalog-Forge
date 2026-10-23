"use client";

import { type LucideIcon, XIcon } from "lucide-react";

const MB = 1024 * 1024;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${Math.round(n / 1024)} KB`;
  return `${(n / MB).toFixed(1)} MB`;
}

export interface FileRowProps {
  icon: LucideIcon;
  label: string;
  name: string;
  /** Bytes for a file; a link has none and shows `detail` instead. */
  size?: number;
  detail?: string;
  disabled: boolean;
  onRemove: () => void;
}

/** One line of the "Selected files" list in the upload panel: a sheet, a dump, a photo, a ZIP or a Google Sheets link. */
export function FileRow({ icon: Icon, label, name, size, detail, disabled, onRemove }: FileRowProps) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Icon className="size-4 shrink-0 text-ink-muted" aria-hidden />
      <span className="w-10 shrink-0 text-[10px] uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate text-ink" title={name}>
        {name}
      </span>
      <span className="num shrink-0 text-xs text-ink-muted">{size !== undefined ? formatBytes(size) : detail}</span>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        disabled={disabled}
        onClick={onRemove}
        className="cursor-pointer rounded-sm p-1 text-ink-muted transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <XIcon className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}
