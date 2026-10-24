"use client";

import { useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MAX_VALUE_LENGTH = 500;

/**
 * Key/value rows for product attributes. Rows are kept in insertion order so a reviewer's edits do not
 * jump around; the record is rebuilt on every change because the API wants a plain object.
 */
export function AttributesEditor({ value, onChange }: { value: Record<string, string>; onChange: (next: Record<string, string>) => void }) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const entries = Object.entries(value);

  const update = (key: string, nextValue: string) => onChange({ ...value, [key]: nextValue.slice(0, MAX_VALUE_LENGTH) });
  const rename = (oldKey: string, nextKey: string) => {
    const trimmed = nextKey.trim();
    if (!trimmed || trimmed === oldKey || trimmed in value) return;
    const next: Record<string, string> = {};
    for (const [k, v] of entries) next[k === oldKey ? trimmed : k] = v;
    onChange(next);
  };
  const remove = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };
  const add = () => {
    const key = newKey.trim();
    if (!key || key in value) return;
    onChange({ ...value, [key]: newValue.trim().slice(0, MAX_VALUE_LENGTH) });
    setNewKey("");
    setNewValue("");
  };

  return (
    <div className="flex flex-col gap-1">
      {entries.length === 0 ? <p className="text-xs text-ink-muted">No attributes.</p> : null}
      {entries.map(([key, val]) => (
        <div key={key} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-1">
          <Input aria-label={`Attribute name ${key}`} defaultValue={key} onBlur={(e) => rename(key, e.target.value)} className="h-7 text-xs md:text-xs" />
          <Input aria-label={`Value of ${key}`} value={val} onChange={(e) => update(key, e.target.value)} className="h-7 text-xs md:text-xs" />
          <Button type="button" variant="ghost" size="icon-xs" onClick={() => remove(key)} aria-label={`Remove attribute ${key}`} className="cursor-pointer text-ink-muted hover:text-destructive">
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] items-center gap-1">
        <Input aria-label="New attribute name" placeholder="Name" value={newKey} onChange={(e) => setNewKey(e.target.value)} className="h-7 text-xs md:text-xs" />
        <Input
          aria-label="New attribute value"
          placeholder="Value"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="h-7 text-xs md:text-xs"
        />
        <Button type="button" variant="outline" size="icon-xs" disabled={!newKey.trim()} onClick={add} aria-label="Add attribute" className="cursor-pointer">
          <PlusIcon />
        </Button>
      </div>
    </div>
  );
}
