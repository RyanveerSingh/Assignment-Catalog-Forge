"use client";

import { cn } from "cn";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MODES = [
  { value: "fast", label: "Fast", hint: "Results in minutes.", detail: "Realtime API" },
  { value: "economy", label: "Economy", hint: "About half the price; can take hours.", detail: "Batch API" },
] as const;
type Mode = (typeof MODES)[number]["value"];

export interface UploadOptionsValue {
  mode: Mode;
  /** Dollars as typed; validated when the import starts. */
  budget: string;
  /** Approve every product that passes all checks as soon as the import finishes (EC-F11). */
  autoPublish: boolean;
}

export const DEFAULT_UPLOAD_OPTIONS: UploadOptionsValue = { mode: "fast", budget: "5", autoPublish: false };

interface Props {
  uid: string;
  value: UploadOptionsValue;
  onChange: (next: UploadOptionsValue) => void;
  disabled: boolean;
}

/** Speed, budget and the publish switch: the three choices a merchant makes before an import starts. */
export function UploadOptions({ uid, value, onChange, disabled }: Props) {
  const set = (patch: Partial<UploadOptionsValue>): void => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <fieldset className="flex min-w-0 flex-col gap-1.5">
          <legend className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-muted">Speed</legend>
          <div className="grid grid-cols-2 gap-px bg-border hairline">
            {MODES.map((m) => (
              <label
                key={m.value}
                className={cn(
                  "flex cursor-pointer flex-col gap-0.5 bg-card px-3 py-2 transition-colors has-[:checked]:bg-brand-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-inset",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <input type="radio" name={`${uid}-mode`} value={m.value} checked={value.mode === m.value} disabled={disabled} onChange={() => set({ mode: m.value })} className="sr-only" />
                <span className="text-sm font-medium text-ink">{m.label}</span>
                <span className="text-xs text-ink-muted">
                  {m.hint} <span className="text-[11px] text-ink-muted/80">{m.detail}.</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-budget`} className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">
            AI budget
          </label>
          <div className="relative">
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-ink-muted">
              $
            </span>
            <Input id={`${uid}-budget`} type="number" inputMode="decimal" min={1} step={1} value={value.budget} disabled={disabled} onChange={(e) => set({ budget: e.target.value })} aria-describedby={`${uid}-budget-hint`} className="num bg-card pl-6" />
          </div>
          <p id={`${uid}-budget-hint`} className="text-xs text-ink-muted">
            The import pauses for your review when AI spend reaches this amount.
          </p>
        </div>
      </div>
      <Label className={cn("flex cursor-pointer items-start gap-3 bg-card px-3 py-2.5 font-normal hairline", disabled && "cursor-not-allowed opacity-60")}>
        <Checkbox checked={value.autoPublish} disabled={disabled} onCheckedChange={(checked) => set({ autoPublish: checked })} className="mt-0.5 cursor-pointer" />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-ink">Publish products that pass every check</span>
          <span className="text-xs text-ink-muted">They go live on your storefront the moment the import finishes. Anything that needs a second look still waits for you.</span>
        </span>
      </Label>
    </div>
  );
}
