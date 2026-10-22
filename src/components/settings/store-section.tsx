"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SaveBar, SectionCard, useSave } from "./section-card";
import type { SectionProps } from "./settings-form";

const CURRENCIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "EUR", label: "EUR · Euro" },
  { value: "GBP", label: "GBP · Pound sterling" },
  { value: "USD", label: "USD · US dollar" },
  { value: "CHF", label: "CHF · Swiss franc" },
];

export function StoreSection({ settings, disabled, onSave }: SectionProps) {
  const [name, setName] = useState(settings.name);
  const [currency, setCurrency] = useState(settings.defaultCurrency);
  const { state, run, reset } = useSave();
  const items = CURRENCIES.some((c) => c.value === currency) ? CURRENCIES : [{ value: currency, label: currency }, ...CURRENCIES];
  const dirty = name.trim() !== settings.name || currency !== settings.defaultCurrency;

  return (
    <SectionCard id="store" title="Store" description="The name visitors see in the storefront, and the currency assumed when a sheet gives prices without one.">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="store-name">Store name</Label>
          <Input
            id="store-name"
            value={name}
            maxLength={80}
            disabled={disabled}
            onChange={(e) => {
              setName(e.target.value);
              reset();
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="store-currency">Default currency</Label>
          <Select
            items={items}
            value={currency}
            disabled={disabled}
            onValueChange={(v) => {
              if (typeof v === "string") {
                setCurrency(v);
                reset();
              }
            }}
          >
            <SelectTrigger id="store-currency" className="w-full cursor-pointer">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((c) => (
                <SelectItem key={c.value} value={c.value} className="cursor-pointer">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <SaveBar state={state} dirty={dirty && name.trim().length > 0} disabled={disabled} onSave={() => void run(() => onSave({ name: name.trim(), defaultCurrency: currency }))} />
    </SectionCard>
  );
}
