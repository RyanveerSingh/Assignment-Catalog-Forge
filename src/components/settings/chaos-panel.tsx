"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, FlaskConicalIcon, Power } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/client/api";
import { SaveBar, SectionCard, useSave } from "./section-card";
import type { ChaosDto, ChaosStateDto } from "./settings-form";

const SLIDERS: ReadonlyArray<{ key: keyof ChaosDto; label: string; hint: string }> = [
  { key: "rateLimitPct", label: "Rate limit (429)", hint: "share of AI calls that come back rate-limited; the worker backs off and retries" },
  { key: "timeoutPct", label: "Timeout", hint: "share of AI calls that hang past the deadline; retried, then the product is marked for review" },
  { key: "invalidJsonPct", label: "Invalid JSON", hint: "share of AI replies that are malformed; the repair prompt runs once before giving up" },
  { key: "inventedClaimPct", label: "Invented claim", hint: "share of listings that get a claim the supplier negated slipped in; the grounding validator must block it and send the product to review" },
];

/* A native range with a brand-colour 20 px thumb on a thin track; the filled part of the track is painted by a gradient that follows the value. */
const RANGE =
  "h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-2 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 " +
  "[&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_var(--card),0_2px_8px_rgba(228,71,15,0.45)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:hover:scale-110 " +
  "[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand [&::-moz-range-thumb]:shadow-[0_0_0_4px_var(--card),0_2px_8px_rgba(228,71,15,0.45)]";

type CrashState = { kind: "idle" } | { kind: "confirm" } | { kind: "sending" } | { kind: "sent"; message: string } | { kind: "error"; message: string };

/** Live failure injection for demos. Any signed-in user may use it; it is global, not per store. */
export function ChaosPanel({ chaos, onApplied }: { chaos: ChaosStateDto | null; onApplied: (c: ChaosStateDto) => void }) {
  const [draft, setDraft] = useState<ChaosDto | null>(chaos);
  const [crash, setCrash] = useState<CrashState>({ kind: "idle" });
  const { state, run, reset } = useSave();

  // The panel mounts before the first chaos fetch resolves; adopt the server values once, without clobbering edits.
  useEffect(() => {
    setDraft((cur) => cur ?? chaos);
  }, [chaos]);

  const dirty = draft !== null && chaos !== null && SLIDERS.some((s) => draft[s.key] !== chaos[s.key]);

  return (
    <SectionCard id="chaos" icon={FlaskConicalIcon} tone="testing" title="Chaos" description="Inject AI failures on purpose to watch retries, pauses and repair happen on a real import. Leave everything at 0 for normal operation.">
      {draft === null ? (
        <p className="text-sm text-ink-muted">Chaos settings are unavailable right now.</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {SLIDERS.map((s) => {
            const id = `chaos-${s.key}`;
            const value = draft[s.key];
            return (
              <div key={s.key} className="space-y-2 rounded-2xl bg-surface-2/50 p-4">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={id} className="text-sm font-medium text-ink">
                    {s.label}
                  </label>
                  {/* The pill turns amber once any failure is switched on. */}
                  <output htmlFor={id} className={cn("num inline-flex h-6 min-w-12 items-center justify-center rounded-full px-2 text-[11px] font-semibold transition-colors", value > 0 ? "bg-warning-soft text-warning" : "bg-card text-ink-muted ring-1 ring-border")}>
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
                  style={{ backgroundImage: `linear-gradient(to right, var(--brand) ${value}%, transparent ${value}%)` }}
                  className={RANGE}
                />
                <p id={`${id}-hint`} className="text-xs leading-relaxed text-ink-muted">
                  {s.hint}
                </p>
              </div>
            );
          })}
        </div>
      )}
      {chaos?.expiresAt ? (
        <p className="text-xs text-ink-muted">
          Shared demo: these settings switch back off at {new Date(chaos.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}, so the next reviewer starts clean.
        </p>
      ) : null}
      <SaveBar
        state={state}
        dirty={dirty}
        disabled={draft === null}
        label="Apply"
        onSave={() =>
          void run(async () => {
            if (!draft) return;
            const applied = await api<ChaosStateDto>("/api/admin/chaos", { method: "PATCH", json: draft });
            onApplied(applied);
          })
        }
      />

      <div className="space-y-2 border-t border-border pt-5">
        <p className="text-sm font-medium text-ink">Crash the worker</p>
        <p className="text-xs leading-relaxed text-ink-muted">
          Kills the worker mid-batch: every job in flight loses its lease without reporting back, a fresh worker starts two seconds later, and the reaper hands it the abandoned work. The import resumes from its last checkpoint with no row lost and none charged twice, and the storefront never stops serving.
        </p>
        {crash.kind === "confirm" ? (
          <div role="alertdialog" aria-labelledby="crash-confirm-title" className="flex flex-wrap items-center gap-3 rounded-2xl bg-destructive/5 px-4 py-3 text-sm ring-1 ring-destructive/20">
            <AlertTriangle aria-hidden className="size-4 shrink-0 text-destructive" />
            <span id="crash-confirm-title" className="text-destructive">
              Crash the worker now? Watch the import event log for the reaper reclaiming its jobs.
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                autoFocus
                className="cursor-pointer rounded-full"
                onClick={() => {
                  setCrash({ kind: "sending" });
                  api<{ message?: string }>("/api/admin/crash", { method: "POST" })
                    .then((r) => setCrash({ kind: "sent", message: r.message ?? "Worker crashed; a new one starts in 2 s." }))
                    .catch((err: unknown) => setCrash({ kind: "error", message: err instanceof ApiError ? err.message : "Could not reach the server" }));
                }}
              >
                Yes, crash it
              </Button>
              <Button size="sm" variant="outline" className="cursor-pointer rounded-full" onClick={() => setCrash({ kind: "idle" })}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="destructive" disabled={crash.kind === "sending"} className="cursor-pointer rounded-full" onClick={() => setCrash({ kind: "confirm" })}>
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
