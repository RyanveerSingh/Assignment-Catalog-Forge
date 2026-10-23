"use client";

import Link from "next/link";
import { ArrowLeftIcon, BanIcon, PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { Chip } from "@/components/ext/chip";
import { StatusBadge } from "@/components/ext/status-badge";
import { CARD } from "@/components/ext/surfaces";
import { Button } from "@/components/ui/button";
import { formatDuration, modeLabel } from "@/lib/format";
import { ConnBadge, type Connection, Stamp } from "./import-live-status";
import type { ImportDto } from "./import-live-types";

export type ImportAction = "pause" | "resume" | "cancel" | "retry";

interface Props {
  storeSlug: string;
  imp: ImportDto;
  now: number;
  elapsedMs: number | null;
  live: boolean;
  conn: Connection;
  busy: ImportAction | null;
  confirmCancel: boolean;
  actionError: string | null;
  onConfirmCancel: (v: boolean) => void;
  onAction: (a: ImportAction) => void;
}

const PILL = "cursor-pointer rounded-full";

/** The import's header card: back link, name with status and mode chips, the timings, and the pause / resume / retry / cancel controls. */
export function ImportHeader({ storeSlug, imp, now, elapsedMs, live, conn, busy, confirmCancel, actionError, onConfirmCancel, onAction }: Props) {
  const canPause = live && imp.status !== "paused";
  const canResume = imp.status === "paused";
  const canRetry = imp.status === "failed" || imp.status === "needs_attention";
  const mode = modeLabel(imp.mode);
  return (
    <header className={`${CARD} px-5 py-5 md:px-6`}>
      <Link href={`/app/${storeSlug}/upload`} className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full text-xs font-medium text-ink-muted transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
        <ArrowLeftIcon className="size-3.5" aria-hidden /> All imports
      </Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display max-w-full min-w-0 truncate text-[1.6rem] leading-tight text-ink md:text-[1.9rem]">{imp.name}</h1>
            <StatusBadge status={imp.status} size="md" />
            <Chip tone={imp.mode === "economy" ? "neutral" : "brand"} title={mode.detail}>
              {mode.label}
            </Chip>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
            <span>
              Created <Stamp iso={imp.createdAt} now={now} />
            </span>
            {imp.startedAt ? (
              <span>
                Started <Stamp iso={imp.startedAt} now={now} />
              </span>
            ) : null}
            {imp.finishedAt ? (
              <span>
                Finished <Stamp iso={imp.finishedAt} now={now} />
              </span>
            ) : null}
            {elapsedMs !== null ? (
              <span className="num" suppressHydrationWarning>
                {formatDuration(elapsedMs)}
                {imp.finishedAt ? "" : " so far"}
              </span>
            ) : null}
            <ConnBadge live={live} conn={conn} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPause ? (
            <Button variant="outline" className={PILL} disabled={busy !== null} onClick={() => onAction("pause")}>
              <PauseIcon data-icon="inline-start" aria-hidden /> Pause
            </Button>
          ) : null}
          {canResume ? (
            <Button className={PILL} disabled={busy !== null} onClick={() => onAction("resume")}>
              <PlayIcon data-icon="inline-start" aria-hidden /> Resume
            </Button>
          ) : null}
          {canRetry ? (
            <Button className={PILL} disabled={busy !== null} onClick={() => onAction("retry")}>
              <RotateCcwIcon data-icon="inline-start" aria-hidden /> Retry
            </Button>
          ) : null}
          {live && !confirmCancel ? (
            <Button variant="outline" className={`${PILL} text-destructive hover:text-destructive`} disabled={busy !== null} onClick={() => onConfirmCancel(true)}>
              <BanIcon data-icon="inline-start" aria-hidden /> Cancel
            </Button>
          ) : null}
          {live && confirmCancel ? (
            <div role="group" aria-label="Confirm cancel" className="flex flex-wrap items-center gap-2 rounded-2xl bg-destructive/5 px-3 py-2 text-xs text-ink ring-1 ring-destructive/20">
              <span>Cancel this import? Open rows are marked failed.</span>
              <Button variant="destructive" size="sm" className={PILL} disabled={busy !== null} onClick={() => onAction("cancel")}>
                Yes, cancel
              </Button>
              <Button variant="ghost" size="sm" className={PILL} disabled={busy !== null} onClick={() => onConfirmCancel(false)}>
                Keep running
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      {actionError ? (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {actionError}
        </p>
      ) : null}
    </header>
  );
}
