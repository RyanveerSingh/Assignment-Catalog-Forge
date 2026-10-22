"use client";

import { useCallback, useState } from "react";
import { AlertCircle, CheckCircle2, FlaskConical, Loader2 } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/client/api";

export type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

/** One save lifecycle per section so each card reports its own success or failure inline. */
export function useSave(): { state: SaveState; run: (fn: () => Promise<unknown>) => Promise<void>; reset: () => void } {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setState({ kind: "saving" });
    try {
      await fn();
      setState({ kind: "saved" });
    } catch (err) {
      setState({ kind: "error", message: err instanceof ApiError ? err.message : "Could not save" });
    }
  }, []);
  const reset = useCallback(() => setState({ kind: "idle" }), []);
  return { state, run, reset };
}

export function SectionCard({ id, title, description, tone = "default", children }: { id: string; title: string; description?: React.ReactNode; tone?: "default" | "testing"; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className={cn("rounded-sm bg-card hairline", tone === "testing" && "ring-2 ring-warning/40")}>
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3 md:px-5">
        <div>
          <h2 id={`${id}-title`} className="font-display text-lg text-ink">
            {title}
          </h2>
          {description ? <p className="mt-0.5 max-w-2xl text-xs text-ink-muted">{description}</p> : null}
        </div>
        {tone === "testing" ? (
          <span className="inline-flex h-5 items-center gap-1 rounded-sm bg-warning-soft px-1.5 text-[11px] font-medium uppercase tracking-wide text-warning ring-1 ring-inset ring-warning/25">
            <FlaskConical aria-hidden className="size-3" />
            Testing only
          </span>
        ) : null}
      </header>
      <div className="space-y-4 px-4 py-4 md:px-5">{children}</div>
    </section>
  );
}

export function SaveStatus({ state, savedLabel = "Saved" }: { state: SaveState; savedLabel?: string }) {
  return (
    <span role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs">
      {state.kind === "saving" ? <span className="text-ink-muted">Saving…</span> : null}
      {state.kind === "saved" ? (
        <>
          <CheckCircle2 aria-hidden className="size-3.5 text-success" />
          <span className="text-success">{savedLabel}</span>
        </>
      ) : null}
      {state.kind === "error" ? (
        <>
          <AlertCircle aria-hidden className="size-3.5 text-destructive" />
          <span className="text-destructive">{state.message}</span>
        </>
      ) : null}
    </span>
  );
}

export function SaveBar({ state, onSave, disabled, dirty = true, label = "Save" }: { state: SaveState; onSave: () => void; disabled?: boolean; dirty?: boolean; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
      <Button size="sm" onClick={onSave} disabled={disabled || !dirty || state.kind === "saving"}>
        {state.kind === "saving" ? <Loader2 aria-hidden className="animate-spin" /> : null}
        {label}
      </Button>
      <SaveStatus state={state} />
    </div>
  );
}
