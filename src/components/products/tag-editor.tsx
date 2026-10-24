"use client";

import { useState } from "react";
import { XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;

/** Chip editor: Enter or comma adds, Backspace on an empty input removes the last chip. Limits mirror the PATCH schema. */
export function TagEditor({ id, value, onChange }: { id: string; value: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const tag = draft.trim().slice(0, MAX_TAG_LENGTH);
    setDraft("");
    if (!tag || value.includes(tag) || value.length >= MAX_TAGS) return;
    onChange([...value, tag]);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1" aria-label="Tags">
          {value.map((tag) => (
            <li key={tag} className="inline-flex h-6 items-center gap-1 border border-border bg-card pl-2 pr-1 text-xs text-ink">
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="inline-flex size-4 cursor-pointer items-center justify-center rounded-sm text-ink-muted hover:bg-accent hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                aria-label={`Remove tag ${tag}`}
              >
                <XIcon className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        id={id}
        value={draft}
        disabled={value.length >= MAX_TAGS}
        placeholder={value.length >= MAX_TAGS ? `Maximum ${MAX_TAGS} tags` : "Add a tag and press Enter"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        className="h-7 text-xs md:text-xs"
      />
    </div>
  );
}
