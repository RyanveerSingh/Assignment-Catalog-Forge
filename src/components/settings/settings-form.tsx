"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Lock } from "lucide-react";
import { Reveal } from "@/components/ext/reveal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError, storeApi } from "@/lib/client/api";
import { AiSection } from "./ai-section";
import { ChaosPanel } from "./chaos-panel";
import { LanguagesSection } from "./languages-section";
import { SettingsNav } from "./settings-nav";
import { StoreSection } from "./store-section";
import { TranslationSection } from "./translation-section";
import { WebhooksSection } from "./webhooks-section";

export interface StoreSettingsDto {
  id: string;
  slug: string;
  name: string;
  defaultCurrency: string;
  locales: string[];
  countryLocaleMap: Record<string, string>;
  glossary: string[];
  translateOn: "ai_done" | "approve";
  importBudgetCents: number;
  apiKeyMasked: string | null;
  serverKeyConfigured: boolean;
  aiMode: "anthropic" | "mock";
}

export type SettingsPatch = Partial<Pick<StoreSettingsDto, "name" | "defaultCurrency" | "locales" | "countryLocaleMap" | "glossary" | "translateOn" | "importBudgetCents">> & { apiKey?: string };

export interface ChaosDto {
  rateLimitPct: number;
  timeoutPct: number;
  invalidJsonPct: number;
  inventedClaimPct: number;
}

export interface SectionProps {
  settings: StoreSettingsDto;
  disabled: boolean;
  onSave: (patch: SettingsPatch) => Promise<StoreSettingsDto>;
}

export function SettingsForm({ storeSlug, isOwner }: { storeSlug: string; isOwner: boolean }) {
  const [settings, setSettings] = useState<StoreSettingsDto | null>(null);
  const [chaos, setChaos] = useState<ChaosDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, c] = await Promise.all([
        api<StoreSettingsDto>(`${storeApi(storeSlug)}/settings`, { cache: "no-store" }),
        // Chaos is a global test switch; failing to read it must not block the store settings.
        api<ChaosDto>("/api/admin/chaos", { cache: "no-store" }).catch(() => null),
      ]);
      setSettings(s);
      setChaos(c);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load settings");
    }
  }, [storeSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSave = useCallback(
    async (patch: SettingsPatch) => {
      const next = await api<StoreSettingsDto>(`${storeApi(storeSlug)}/settings`, { method: "PATCH", json: patch });
      setSettings(next);
      return next;
    },
    [storeSlug],
  );

  if (error) {
    return (
      <div role="alert" className="flex items-center gap-2 rounded-2xl bg-destructive/5 px-4 py-3 text-sm text-destructive ring-1 ring-destructive/20">
        <AlertCircle aria-hidden className="size-4 shrink-0" />
        <span>{error}</span>
        <Button variant="outline" size="xs" className="ml-auto cursor-pointer rounded-full" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const disabled = !isOwner;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10">
      <SettingsNav />
      {!settings ? (
        <div aria-busy="true" aria-label="Loading settings" className="flex flex-col gap-6">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-6">
          {disabled ? (
            <p role="note" className="flex items-center gap-2 rounded-2xl bg-brand-soft px-4 py-3 text-sm text-brand">
              <Lock aria-hidden className="size-4 shrink-0" />
              Only the store owner can change these settings. You can view them.
            </p>
          ) : null}
          <Reveal index={0}>
            <StoreSection settings={settings} disabled={disabled} onSave={onSave} />
          </Reveal>
          <Reveal index={1}>
            <LanguagesSection settings={settings} disabled={disabled} onSave={onSave} />
          </Reveal>
          <Reveal index={2}>
            <TranslationSection settings={settings} disabled={disabled} onSave={onSave} />
          </Reveal>
          <Reveal index={3}>
            <AiSection settings={settings} disabled={disabled} onSave={onSave} />
          </Reveal>
          <Reveal index={4}>
            <WebhooksSection storeSlug={storeSlug} disabled={disabled} />
          </Reveal>
          <Reveal index={5}>
            <ChaosPanel chaos={chaos} onApplied={setChaos} />
          </Reveal>
        </div>
      )}
    </div>
  );
}
