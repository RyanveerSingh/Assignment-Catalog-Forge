"use client";

import { Segmented } from "@/components/ext/segmented";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const MODES = [
  { value: "fast", label: "Fast", hint: "Realtime API: results in minutes." },
  { value: "economy", label: "Economy", hint: "Batch API: about half the price, can take hours." },
] as const;
type Mode = (typeof MODES)[number]["value"];

export interface UploadOptionsValue {
  mode: Mode;
  /** Dollars as typed; validated when the import starts. */
  budget: string;
  /** Approve every product that passes all checks as soon as the import finishes (EC-F11). */
  autoPublish: boolean;
}

export const DEFAULT_UPLOAD_OPTIONS: UploadOptionsValue = { mode: "fast", budget: "5", autoPublish: true };

interface Props {
  uid: string;
  value: UploadOptionsValue;
  onChange: (next: UploadOptionsValue) => void;
  disabled: boolean;
}

const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted";

/** Speed, budget and the publish switch, as one compact row beneath the drop zone. */
export function UploadOptions({ uid, value, onChange, disabled }: Props) {
  const set = (patch: Partial<UploadOptionsValue>): void => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
      <div className="flex flex-col gap-1.5">
        <span className={EYEBROW}>Speed</span>
        <Segmented label="Speed" value={value.mode} options={MODES} disabled={disabled} onChange={(mode) => set({ mode })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-budget`} className={EYEBROW}>
          AI budget
        </label>
        <div className="relative">
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-ink-muted">
            $
          </span>
          <input
            id={`${uid}-budget`}
            type="number"
            inputMode="decimal"
            min={1}
            step={1}
            value={value.budget}
            disabled={disabled}
            onChange={(e) => set({ budget: e.target.value })}
            title="The import pauses for your review when AI spend reaches this amount."
            className="num h-11 w-28 rounded-full bg-card pr-3 pl-7 text-sm text-ink ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          />
        </div>
      </div>
      <Label htmlFor={`${uid}-publish`} className="flex h-11 cursor-pointer items-center gap-3 rounded-full bg-card pr-4 pl-3 font-normal ring-1 ring-border has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
        <Switch id={`${uid}-publish`} checked={value.autoPublish} disabled={disabled} onCheckedChange={(checked) => set({ autoPublish: checked })} className="cursor-pointer" />
        <span className="flex flex-col leading-tight">
          <span className="text-[13px] font-medium text-ink">Publish what passes every check</span>
          <span className="text-[11px] text-ink-muted">Anything flagged still waits for you</span>
        </span>
      </Label>
    </div>
  );
}
