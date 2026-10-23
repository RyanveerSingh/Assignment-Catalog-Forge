"use client";

import { useState } from "react";
import { cn } from "cn";
import { CheckIcon, SearchIcon, SparklesIcon, XIcon } from "lucide-react";
import { isPromptVersion, PROMPT_VERSION, PROMPT_VERSIONS } from "@/core/ai/prompts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { statusLabel } from "@/lib/format";
import { countActiveFilters, type ProductFilters } from "./products-filters";
import { PRODUCT_STATUSES, RERUN_TIERS, type ProductStatus, type RerunSettings, type RerunTier } from "./types";

const CONFIDENCE_PRESETS: ReadonlyArray<{ key: string; label: string; min: number | null; max: number | null }> = [
  { key: "any", label: "Any", min: null, max: null },
  { key: "low", label: "Low < 60", min: null, max: 59 },
  { key: "mid", label: "Mid 60–84", min: 60, max: 84 },
  { key: "high", label: "High ≥ 85", min: 85, max: null },
];

/** A toggle chip: pressed state is shown by colour AND a check mark. */
function Chip({ pressed, onClick, children, title }: { pressed: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 cursor-pointer items-center gap-1 rounded-sm px-2 text-xs whitespace-nowrap ring-1 ring-inset transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        pressed ? "bg-brand-soft text-brand ring-brand/40" : "bg-card text-ink-muted ring-border hover:bg-accent hover:text-ink",
      )}
    >
      {pressed ? <CheckIcon aria-hidden className="size-3" /> : null}
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={label}>
      <span className="mr-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

export function ProductsToolbar({ filters, searchText, onSearchChange, onChange, onReset, categories }: { filters: ProductFilters; searchText: string; onSearchChange: (q: string) => void; onChange: (patch: Partial<ProductFilters>) => void; onReset: () => void; categories: Array<{ category: string; n: number }> }) {
  const toggleStatus = (s: ProductStatus) => onChange({ status: filters.status.includes(s) ? filters.status.filter((x) => x !== s) : [...filters.status, s] });
  const confidenceKey = CONFIDENCE_PRESETS.find((p) => p.min === filters.minConfidence && p.max === filters.maxConfidence)?.key ?? "custom";
  const active = countActiveFilters(filters);

  return (
    <div className="flex flex-col gap-2 border-b border-border pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-ink-muted" />
          <Input type="search" aria-label="Search title, key, handle or SKU" placeholder="Search title, key, handle, SKU…" value={searchText} onChange={(e) => onSearchChange(e.target.value)} className="h-8 bg-card pl-7 text-sm md:text-sm" />
        </div>
        <div className="flex items-center gap-1">
          <Label htmlFor="filter-import" className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
            Import
          </Label>
          <Input id="filter-import" placeholder="import id" value={filters.importId} onChange={(e) => onChange({ importId: e.target.value.trim() })} className="h-8 w-[150px] bg-card num text-xs md:text-xs" spellCheck={false} />
        </div>
        <div className="flex items-center gap-1">
          <Label className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">Category</Label>
          <Select value={filters.category || "__all__"} onValueChange={(v) => onChange({ category: v && v !== "__all__" ? v : "" })}>
            <SelectTrigger size="default" aria-label="Category" className="h-8 w-[200px] cursor-pointer bg-card text-xs">
              <SelectValue>{(v: string) => (v === "__all__" || !v ? "All categories" : v.split(" > ").slice(-1)[0])}</SelectValue>
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false} className="w-auto min-w-[260px] max-w-[420px]">
              <SelectItem value="__all__">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.category} value={c.category} className="text-xs">
                  <span className="truncate">{c.category}</span>
                  <span className="ml-auto num text-ink-muted">{c.n}</span>
                </SelectItem>
              ))}
              {filters.category && !categories.some((c) => c.category === filters.category) ? (
                <SelectItem value={filters.category} className="text-xs">
                  {filters.category}
                </SelectItem>
              ) : null}
            </SelectContent>
          </Select>
        </div>
        {active > 0 ? (
          <button type="button" onClick={onReset} className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-sm px-2 text-xs text-ink-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <XIcon aria-hidden className="size-3" />
            Clear {active} {active === 1 ? "filter" : "filters"}
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Group label="Status">
          {PRODUCT_STATUSES.map((s) => (
            <Chip key={s} pressed={filters.status.includes(s)} onClick={() => toggleStatus(s)}>
              {statusLabel(s)}
            </Chip>
          ))}
        </Group>
        <Group label="Confidence">
          {CONFIDENCE_PRESETS.map((p) => (
            <Chip key={p.key} pressed={confidenceKey === p.key} onClick={() => onChange({ minConfidence: p.min, maxConfidence: p.max })}>
              {p.label}
            </Chip>
          ))}
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
            <Input aria-label="Minimum confidence" type="number" min={0} max={100} placeholder="min" value={filters.minConfidence ?? ""} onChange={(e) => onChange({ minConfidence: e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value))) })} className="h-7 w-14 bg-card px-1.5 num text-xs md:text-xs" />
            –
            <Input aria-label="Maximum confidence" type="number" min={0} max={100} placeholder="max" value={filters.maxConfidence ?? ""} onChange={(e) => onChange({ maxConfidence: e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value))) })} className="h-7 w-14 bg-card px-1.5 num text-xs md:text-xs" />
          </span>
        </Group>
        <Group label="Show">
          <Chip pressed={filters.hasPhotos === true} onClick={() => onChange({ hasPhotos: filters.hasPhotos === true ? null : true })}>
            Has photos
          </Chip>
          <Chip pressed={filters.hasPhotos === false} onClick={() => onChange({ hasPhotos: filters.hasPhotos === false ? null : false })}>
            No photos
          </Chip>
          <Chip pressed={filters.outdated} onClick={() => onChange({ outdated: !filters.outdated })} title="Products with a translation that is out of date">
            Outdated translations
          </Chip>
          <Chip pressed={filters.missing} onClick={() => onChange({ missing: !filters.missing })} title="Products a later upload of the same source no longer contained">
            Missing from latest upload
          </Chip>
          <Chip pressed={filters.deleted} onClick={() => onChange({ deleted: !filters.deleted })}>
            Show deleted
          </Chip>
        </Group>
      </div>
    </div>
  );
}

// --- re-run AI ---------------------------------------------------------------

const TIER_ITEMS = RERUN_TIERS.map((t) => ({ value: t.value, label: t.label }));
const PROMPT_ITEMS = PROMPT_VERSIONS.map((p) => ({ value: p.id, label: p.label }));

/** Tier and prompt-version selects shared by the review drawer and the bulk popover; the prompt list is the registry, never free text. */
export function RerunSettingsFields({ idPrefix, value, onChange, disabled }: { idPrefix: string; value: RerunSettings; onChange: (next: RerunSettings) => void; disabled?: boolean }) {
  const version = PROMPT_VERSIONS.find((p) => p.id === value.promptVersion);
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-tier`} className="text-xs">
          Model tier
        </Label>
        <Select value={value.tier} items={TIER_ITEMS} disabled={disabled} onValueChange={(v) => v && onChange({ ...value, tier: v as RerunTier })}>
          <SelectTrigger id={`${idPrefix}-tier`} size="sm" className="w-full cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RERUN_TIERS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-prompt`} className="text-xs">
          Prompt version
        </Label>
        <Select value={value.promptVersion} items={PROMPT_ITEMS} disabled={disabled} onValueChange={(v) => v && isPromptVersion(v) && onChange({ ...value, promptVersion: v })}>
          <SelectTrigger id={`${idPrefix}-prompt`} size="sm" className="w-full cursor-pointer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROMPT_VERSIONS.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {version ? <p className="text-[11px] leading-snug text-ink-muted">{version.summary}</p> : null}
      </div>
    </>
  );
}

/** The bulk-bar buttons are 24 px tall; 10 px of invisible hit area above and below makes a 44 px tap (same trick as Checkbox and the photo tray). */
const TAP_TARGET_XS = "relative after:absolute after:inset-x-0 after:-inset-y-2.5 after:content-['']";

/** "Re-run AI" for the selection: one job per product with the chosen tier and prompt version; the Queue button is the confirmation. */
export function BulkRerunPopover({ count, busy, disabled, onQueue }: { count: number; busy: boolean; disabled: boolean; onQueue: (settings: RerunSettings) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<RerunSettings>({ tier: "cheap", promptVersion: PROMPT_VERSION });
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button type="button" variant="outline" size="xs" disabled={disabled} className={cn("cursor-pointer", TAP_TARGET_XS)} />}>
        <SparklesIcon data-icon="inline-start" />
        Re-run AI
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <PopoverHeader>
          <PopoverTitle>
            Re-run AI on {count} {count === 1 ? "product" : "products"}
          </PopoverTitle>
          <PopoverDescription className="text-xs">Each product gets a fresh draft with these settings; published versions stay until re-approved. Products without source rows, deleted or still running are skipped and counted.</PopoverDescription>
        </PopoverHeader>
        <RerunSettingsFields idPrefix="bulk-rerun" value={settings} onChange={setSettings} disabled={busy} />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={busy}
            className="cursor-pointer bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={async () => {
              const ok = await onQueue(settings);
              if (ok) setOpen(false);
            }}
          >
            {busy ? "Queuing…" : `Queue ${count} ${count === 1 ? "re-run" : "re-runs"}`}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setOpen(false)} className="cursor-pointer">
            Cancel
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
