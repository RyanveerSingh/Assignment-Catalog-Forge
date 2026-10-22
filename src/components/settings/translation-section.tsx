"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SaveBar, SectionCard, useSave } from "./section-card";
import type { SectionProps, StoreSettingsDto } from "./settings-form";

const MAX_TERMS = 200;
const MAX_TERM_LENGTH = 60;

const TRIGGERS: ReadonlyArray<{ value: StoreSettingsDto["translateOn"]; label: string; hint: string }> = [
  { value: "ai_done", label: "After the AI stage", hint: "Translate every product as soon as its English listing is written. Fastest to publish; a later edit marks the translation outdated." },
  { value: "approve", label: "On approve", hint: "Translate only when a reviewer approves the product. Fewer wasted tokens when listings get edited." },
];

export function TranslationSection({ settings, disabled, onSave }: SectionProps) {
  const [terms, setTerms] = useState<string[]>(settings.glossary);
  const [draft, setDraft] = useState("");
  const [translateOn, setTranslateOn] = useState(settings.translateOn);
  const { state, run, reset } = useSave();

  const addDraft = () => {
    const pieces = draft
      .split(",")
      .map((t) => t.trim().slice(0, MAX_TERM_LENGTH))
      .filter((t) => t.length > 0);
    if (pieces.length === 0) return;
    setTerms((cur) => {
      const next = [...cur];
      for (const p of pieces) if (!next.includes(p) && next.length < MAX_TERMS) next.push(p);
      return next;
    });
    setDraft("");
    reset();
  };

  return (
    <SectionCard id="translation" title="Translation" description="Brand names and terms in the glossary are never translated; they are passed through verbatim in every language.">
      <div className="space-y-2">
        <Label htmlFor="glossary-input">Glossary</Label>
        <div className="rounded-lg border border-input px-2 py-1.5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
          <ul className="flex flex-wrap items-center gap-1.5" aria-label="Glossary terms">
            {terms.map((term) => (
              <li key={term} className="inline-flex h-6 items-center gap-1 rounded-sm bg-muted pl-2 pr-1 text-xs text-ink">
                {term}
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`Remove ${term}`}
                  onClick={() => {
                    setTerms((cur) => cur.filter((t) => t !== term));
                    reset();
                  }}
                  className="inline-flex size-4 cursor-pointer items-center justify-center rounded-sm text-ink-muted outline-none hover:bg-ink/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </li>
            ))}
            <li className="min-w-40 flex-1">
              <Input
                id="glossary-input"
                value={draft}
                disabled={disabled || terms.length >= MAX_TERMS}
                placeholder={terms.length ? "Add a term…" : "e.g. Lumen, SoftTouch, AquaStop"}
                aria-describedby="glossary-hint"
                className="h-6 border-0 px-1 shadow-none focus-visible:ring-0"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={addDraft}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addDraft();
                  } else if (e.key === "Backspace" && draft === "" && terms.length > 0) {
                    setTerms((cur) => cur.slice(0, -1));
                    reset();
                  }
                }}
              />
            </li>
          </ul>
        </div>
        <p id="glossary-hint" className="text-xs text-ink-muted">
          Press Enter or type a comma to add a term. <span className="num">{terms.length}</span>/{MAX_TERMS}.
        </p>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Translate</legend>
        {TRIGGERS.map((t) => {
          const id = `translate-on-${t.value}`;
          return (
            <div key={t.value} className="flex items-start gap-2">
              <input
                type="radio"
                id={id}
                name="translateOn"
                value={t.value}
                checked={translateOn === t.value}
                disabled={disabled}
                onChange={() => {
                  setTranslateOn(t.value);
                  reset();
                }}
                className="mt-1 size-3.5 cursor-pointer accent-brand disabled:cursor-not-allowed"
              />
              <Label htmlFor={id} className="flex-col items-start gap-0.5 cursor-pointer">
                <span>{t.label}</span>
                <span className="text-xs font-normal leading-snug text-ink-muted">{t.hint}</span>
              </Label>
            </div>
          );
        })}
      </fieldset>

      <SaveBar state={state} disabled={disabled} onSave={() => void run(() => onSave({ glossary: terms, translateOn }))} />
    </SectionCard>
  );
}
