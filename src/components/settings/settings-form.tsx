"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiError, storeApi } from "@/lib/client/api";
import { AiSection } from "./ai-section";
import { ChaosPanel } from "./chaos-panel";
import { LanguagesSection } from "./languages-section";
import { StoreSection } from "./store-section";
import { TranslationSection } from "./translation-section";

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
      <div role="alert" className="flex items-center gap-2 rounded-sm bg-destructive/10 px-3 py-2 text-sm text-destructive">
        <AlertCircle aria-hidden className="size-4 shrink-0" />
        <span>{error}</span>
        <Button variant="outline" size="xs" className="ml-auto" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!settings) {
    return (
      <div aria-busy="true" aria-label="Loading settings" className="space-y-6">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-40 rounded-sm" />
        ))}
      </div>
    );
  }

  const disabled = !isOwner;
  return (
    <div className="space-y-6">
      {disabled ? (
        <p role="note" className="flex items-center gap-2 rounded-sm bg-info-soft px-3 py-2 text-sm text-info">
          <Lock aria-hidden className="size-4 shrink-0" />
          Only the store owner can change these settings. You can view them.
        </p>
      ) : null}
      <StoreSection settings={settings} disabled={disabled} onSave={onSave} />
      <LanguagesSection settings={settings} disabled={disabled} onSave={onSave} />
      <TranslationSection settings={settings} disabled={disabled} onSave={onSave} />
      <AiSection settings={settings} disabled={disabled} onSave={onSave} />
      <ChaosPanel chaos={chaos} onApplied={setChaos} />
    </div>
  );
}
