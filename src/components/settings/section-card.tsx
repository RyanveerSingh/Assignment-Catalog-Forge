"use client";

import { useCallback, useState } from "react";
import { AlertCircle, CheckCircle2, FlaskConical, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { Chip } from "@/components/ext/chip";
import { CARD } from "@/components/ext/surfaces";
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

/** A settings card: an icon tile, the title, a one-line subtitle and the controls. The testing tone wears an amber ring. `id` is the anchor the section list jumps to. */
export function SectionCard({ id, title, description, icon: Icon, tone = "default", children }: { id: string; title: string; description?: React.ReactNode; icon?: LucideIcon; tone?: "default" | "testing"; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={cn(CARD, "scroll-mt-20", tone === "testing" && "shadow-[0_0_0_1px_var(--warning),var(--shadow-card)]")}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4 md:px-6">
        <div className="flex min-w-0 items-start gap-3.5">
          {Icon ? (
            <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone === "testing" ? "bg-warning-soft text-warning" : "bg-brand-soft text-brand")}>
              <Icon className="size-5" />
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="font-display text-[1.15rem] leading-tight text-ink">
              {title}
            </h2>
            {description ? <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">{description}</p> : null}
          </div>
        </div>
        {tone === "testing" ? (
          <Chip tone="warning" icon={FlaskConical}>
            Testing only
          </Chip>
        ) : null}
      </header>
      <div className="space-y-5 px-5 py-5 md:px-6">{children}</div>
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
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
      <Button onClick={onSave} disabled={disabled || !dirty || state.kind === "saving"} className="cursor-pointer rounded-full px-5">
        {state.kind === "saving" ? <Loader2 aria-hidden className="animate-spin" /> : null}
        {label}
      </Button>
      <SaveStatus state={state} />
    </div>
  );
}
