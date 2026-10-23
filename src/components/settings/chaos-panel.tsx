"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Power } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/client/api";
import { SaveBar, SectionCard, useSave } from "./section-card";
import type { ChaosDto } from "./settings-form";

const SLIDERS: ReadonlyArray<{ key: keyof ChaosDto; label: string; hint: string }> = [
  { key: "rateLimitPct", label: "Rate limit (429)", hint: "share of AI calls that come back rate-limited; the worker backs off and retries" },
  { key: "timeoutPct", label: "Timeout", hint: "share of AI calls that hang past the deadline; retried, then the product is marked for review" },
  { key: "invalidJsonPct", label: "Invalid JSON", hint: "share of AI replies that are malformed; the repair prompt runs once before giving up" },
];

type CrashState = { kind: "idle" } | { kind: "confirm" } | { kind: "sending" } | { kind: "sent"; message: string } | { kind: "error"; message: string };

/** Live failure injection for demos. Any signed-in user may use it; it is global, not per store. */
export function ChaosPanel({ chaos, onApplied }: { chaos: ChaosDto | null; onApplied: (c: ChaosDto) => void }) {
  const [draft, setDraft] = useState<ChaosDto | null>(chaos);
  const [crash, setCrash] = useState<CrashState>({ kind: "idle" });
  const { state, run, reset } = useSave();

  // The panel mounts before the first chaos fetch resolves; adopt the server values once, without clobbering edits.
  useEffect(() => {
    setDraft((cur) => cur ?? chaos);
  }, [chaos]);

  const dirty = draft !== null && chaos !== null && SLIDERS.some((s) => draft[s.key] !== chaos[s.key]);

  return (
    <SectionCard id="chaos" tone="testing" title="Chaos" description="Inject AI failures on purpose to watch retries, pauses and repair happen on a real import. Leave everything at 0 for normal operation.">
      {draft === null ? (
        <p className="text-sm text-ink-muted">Chaos settings are unavailable right now.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {SLIDERS.map((s) => {
            const id = `chaos-${s.key}`;
            const value = draft[s.key];
            return (
              <div key={s.key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={id} className="text-sm font-medium">
                    {s.label}
                  </label>
                  <output htmlFor={id} className="num text-sm text-ink">
                    {value}%
                  </output>
                </div>
                <input
                  id={id}
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={value}
                  aria-valuetext={`${value} percent`}
                  aria-describedby={`${id}-hint`}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setDraft((cur) => (cur ? { ...cur, [s.key]: next } : cur));
                    reset();
                  }}
                  className="w-full cursor-pointer accent-brand"
                />
                <p id={`${id}-hint`} className="text-xs text-ink-muted">
                  {s.hint}
                </p>
              </div>
            );
          })}
        </div>
      )}
      <SaveBar
        state={state}
        dirty={dirty}
        disabled={draft === null}
        label="Apply"
        onSave={() =>
          void run(async () => {
            if (!draft) return;
            const applied = await api<ChaosDto>("/api/admin/chaos", { method: "PATCH", json: draft });
            onApplied(applied);
          })
        }
      />

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-medium">Crash the worker</p>
        <p className="text-xs text-ink-muted">
          Kills the worker mid-batch: every job in flight loses its lease without reporting back, a fresh worker starts two seconds later, and the reaper hands it the abandoned work. The import resumes from its last checkpoint with no row lost and none charged twice, and the storefront never stops serving.
        </p>
        {crash.kind === "confirm" ? (
          <div role="alertdialog" aria-labelledby="crash-confirm-title" className="flex flex-wrap items-center gap-3 rounded-sm bg-destructive/10 px-3 py-2 text-sm">
            <AlertTriangle aria-hidden className="size-4 shrink-0 text-destructive" />
            <span id="crash-confirm-title" className="text-destructive">
              Crash the worker now? Watch the import event log for the reaper reclaiming its jobs.
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                autoFocus
                onClick={() => {
                  setCrash({ kind: "sending" });
                  api<{ message?: string }>("/api/admin/crash", { method: "POST" })
                    .then((r) => setCrash({ kind: "sent", message: r.message ?? "Worker crashed; a new one starts in 2 s." }))
                    .catch((err: unknown) => setCrash({ kind: "error", message: err instanceof ApiError ? err.message : "Could not reach the server" }));
                }}
              >
                Yes, crash it
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCrash({ kind: "idle" })}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" variant="destructive" disabled={crash.kind === "sending"} onClick={() => setCrash({ kind: "confirm" })}>
              <Power aria-hidden />
              Crash worker now
            </Button>
            <span role="status" aria-live="polite" className="text-xs">
              {crash.kind === "sending" ? <span className="text-ink-muted">Sending…</span> : null}
              {crash.kind === "sent" ? <span className="text-success">{crash.message}</span> : null}
              {crash.kind === "error" ? <span className="text-destructive">{crash.message}</span> : null}
            </span>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
