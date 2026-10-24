"use client";

import { useState } from "react";
import { KeyRound, ShieldCheck, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SaveBar, SaveStatus, SectionCard, useSave } from "./section-card";
import type { SectionProps } from "./settings-form";

const MAX_BUDGET_CENTS = 100_000;

export function AiSection({ settings, disabled, onSave }: SectionProps) {
  const keyLocked = disabled || settings.demoLock?.apiKey === true;
  const maxBudgetCents = settings.demoLock ? settings.demoLock.budgetCapCents : MAX_BUDGET_CENTS;
  const [key, setKey] = useState("");
  const [budgetDollars, setBudgetDollars] = useState((settings.importBudgetCents / 100).toFixed(2));
  const keySave = useSave();
  const budgetSave = useSave();

  const budgetCents = Math.round(Number.parseFloat(budgetDollars || "0") * 100);
  const budgetValid = Number.isFinite(budgetCents) && budgetCents >= 0 && budgetCents <= maxBudgetCents;
  const budgetDirty = budgetValid && budgetCents !== settings.importBudgetCents;
  const live = settings.aiMode === "anthropic";

  return (
    <SectionCard id="ai" icon={SparklesIcon} title="AI" description="Which key writes the listings, and how much one import may spend before it pauses for approval.">
      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="api-key">Anthropic API key</Label>
          <Input
            id="api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="sk-ant-…"
            value={key}
            disabled={keyLocked}
            aria-describedby="api-key-status"
            onChange={(e) => {
              setKey(e.target.value);
              keySave.reset();
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={keyLocked || key.trim() === "" || keySave.state.kind === "saving"}
            onClick={() =>
              void keySave.run(async () => {
                await onSave({ apiKey: key.trim() });
                setKey("");
              })
            }
          >
            <KeyRound aria-hidden />
            Save key
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={keyLocked || !settings.apiKeyMasked || keySave.state.kind === "saving"}
            onClick={() => void keySave.run(() => onSave({ apiKey: "" }))}
          >
            Clear
          </Button>
          <SaveStatus state={keySave.state} savedLabel="Key updated" />
        </div>
      </div>

      <dl id="api-key-status" className="grid gap-x-6 gap-y-1 rounded-sm bg-muted/60 px-3 py-2 text-xs sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-muted">Store key</dt>
        <dd className="num">{settings.apiKeyMasked ?? "none"}</dd>
        <dt className="text-ink-muted">Server key</dt>
        <dd>{settings.serverKeyConfigured ? "configured by the operator" : "not configured"}</dd>
        <dt className="text-ink-muted">Mode</dt>
        <dd className="flex items-center gap-1.5">
          <span aria-hidden className={live ? "size-1.5 rounded-full bg-success" : "size-1.5 rounded-full bg-brand"} />
          <span className="font-medium text-ink">{live ? "Live · Anthropic" : "Demo mode"}</span>
        </dd>
      </dl>
      <p className="flex items-start gap-2 text-xs text-ink-muted">
        <ShieldCheck aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>
          {live
            ? "Listings are written by Claude. The store key takes precedence over the server key; it is encrypted at rest and only ever shown masked."
            : "Without a key, a deterministic stand-in writes the listings so the whole pipeline can be tried end to end. Nothing is sent to an AI provider and nothing is charged. Add a key to switch to Claude; prices and SKUs are never written by the model either way."}
        </span>
      </p>

      <div className="space-y-1.5 border-t border-border pt-4">
        <Label htmlFor="import-budget">Budget per import (USD)</Label>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-40">
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-ink-muted">
              $
            </span>
            <Input
              id="import-budget"
              type="number"
              inputMode="decimal"
              min={0}
              max={maxBudgetCents / 100}
              step="0.5"
              value={budgetDollars}
              disabled={disabled}
              aria-invalid={!budgetValid}
              aria-describedby="import-budget-hint"
              className="num pl-6"
              onChange={(e) => {
                setBudgetDollars(e.target.value);
                budgetSave.reset();
              }}
            />
          </div>
        </div>
        <p id="import-budget-hint" className="text-xs text-ink-muted">
          When an import reaches this amount it pauses and asks before spending more. 0 means no limit beyond the server default. Max ${(maxBudgetCents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}.
        </p>
      </div>
      <SaveBar state={budgetSave.state} dirty={budgetDirty} disabled={disabled || !budgetValid} label="Save budget" onSave={() => void budgetSave.run(() => onSave({ importBudgetCents: budgetCents }))} />
    </SectionCard>
  );
}
