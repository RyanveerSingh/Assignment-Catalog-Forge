"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "motion/react";
import { EmptyState } from "@/components/ext/page-header";
import { CARD, TH } from "@/components/ext/surfaces";
import { api, ApiError, storeApi } from "@/lib/client/api";
import { DropIllustration } from "./drop-illustration";
import { ImportRow } from "./import-row";
import type { ImportDto } from "./import-live-types";
import { RECENT_IMPORTS_LIMIT } from "./recent-imports";
import { isImportActive } from "./stage-stepper";

const POLL_MS = 5_000;

function useTicker(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Recent imports as a raised list card. Polls every 5 s while any import is active; rows and their bars animate in the first time the card is seen. */
export function ImportsTable({ storeSlug, initialImports }: { storeSlug: string; initialImports: ImportDto[] }) {
  const [imports, setImports] = useState(initialImports);
  const [pollError, setPollError] = useState<string | null>(null);
  const anyActive = imports.some((i) => isImportActive(i.status));
  const anyCountdown = imports.some((i) => i.status === "paused" && i.pausedUntil !== null);
  const now = useTicker(anyCountdown ? 1_000 : anyActive ? 5_000 : 30_000);
  const listRef = useRef<HTMLUListElement>(null);
  const revealed = useInView(listRef, { once: true, amount: 0.2 });

  // The server re-renders this list on every navigation; adopt that snapshot instead of keeping a stale one.
  useEffect(() => {
    setImports(initialImports);
  }, [initialImports]);

  useEffect(() => {
    if (!anyActive) return;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      if (document.visibilityState === "hidden") return;
      try {
        const r = await api<{ imports: ImportDto[] }>(`${storeApi(storeSlug)}/imports?limit=${RECENT_IMPORTS_LIMIT}`);
        if (cancelled) return;
        setImports(r.imports);
        setPollError(null);
      } catch (err) {
        if (!cancelled) setPollError(err instanceof ApiError ? err.message : "Live refresh failed; retrying");
      }
    };
    const t = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [anyActive, storeSlug]);

  return (
    <section aria-labelledby="imports-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <h2 id="imports-heading" className="font-display text-lg text-ink">
          Recent imports
        </h2>
        <div className="flex items-center gap-3 text-[11px] text-ink-muted">
          {anyActive ? (
            <span className="inline-flex items-center gap-1.5 text-brand" role="status">
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-brand" />
              Live · refreshes every 5 s
            </span>
          ) : null}
          {pollError ? (
            <span className="text-destructive" role="alert">
              {pollError}
            </span>
          ) : null}
        </div>
      </div>
      {imports.length === 0 ? (
        <EmptyState
          title="No imports yet"
          description="Drop a sheet above, or download a sample and drop it in. Every import lands here with its status, cost and timing."
          art={<DropIllustration active={false} className="w-56 opacity-90" />}
        />
      ) : (
        <div className={CARD}>
          <div className="hidden grid-cols-[minmax(180px,2fr)_150px_minmax(160px,1.6fr)_80px_90px_90px_90px_20px] gap-x-5 border-b border-border px-5 py-2.5 md:grid">
            <span className={TH}>Name</span>
            <span className={TH}>Status</span>
            <span className={TH}>Progress</span>
            <span className={`${TH} text-right`}>Products</span>
            <span className={`${TH} text-right`}>Cost</span>
            <span className={TH}>Started</span>
            <span className={TH}>Duration</span>
            <span />
          </div>
          <ul ref={listRef} className="divide-y divide-border">
            {imports.map((imp, i) => (
              <ImportRow key={imp.id} imp={imp} storeSlug={storeSlug} index={i} now={now} revealed={revealed} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
