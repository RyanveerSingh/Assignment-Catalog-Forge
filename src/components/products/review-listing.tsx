"use client";

import { useId, useMemo, useState } from "react";
import { cn } from "cn";
import { CodeIcon, EyeIcon, SaveIcon } from "lucide-react";
import { TAXONOMY } from "@/core/ai/taxonomy";
import { ConfidenceChip } from "@/components/ext/confidence-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError, storeApi } from "@/lib/client/api";
import { AttributesEditor } from "./attributes-editor";
import { ClaimInspector } from "./claim-inspector";
import { TagEditor } from "./tag-editor";
import { EMPTY_CONTENT, type ProductContent, type ProductDetail, type ProductSeo, type SourceHighlight } from "./types";

const META_TITLE_MAX = 60;
const META_DESCRIPTION_MAX = 155;

type Patch = Partial<Omit<ProductContent, "seo">> & { seo?: Partial<ProductSeo> };

/** Only fields that actually changed are sent, because every field in a PATCH becomes a manual override (EC-F1). */
function diffContent(base: ProductContent, form: ProductContent): Patch {
  const patch: Patch = {};
  if (form.title !== base.title) patch.title = form.title;
  if (form.descriptionHtml !== base.descriptionHtml) patch.descriptionHtml = form.descriptionHtml;
  if (form.category !== base.category) patch.category = form.category;
  if (JSON.stringify(form.tags) !== JSON.stringify(base.tags)) patch.tags = form.tags;
  if (JSON.stringify(form.attributes) !== JSON.stringify(base.attributes)) patch.attributes = form.attributes;
  const seo: Partial<ProductSeo> = {};
  if (form.seo.metaTitle !== base.seo.metaTitle) seo.metaTitle = form.seo.metaTitle;
  if (form.seo.metaDescription !== base.seo.metaDescription) seo.metaDescription = form.seo.metaDescription;
  if (Object.keys(seo).length) patch.seo = seo;
  return patch;
}

function orNull(s: string): string | null {
  return s.trim() === "" ? null : s;
}

function FieldHead({ htmlFor, label, score, edited, extra }: { htmlFor: string; label: string; score: number | undefined; edited: boolean; extra?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Label htmlFor={htmlFor} className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
        {edited ? (
          <span className="inline-flex items-center gap-1 text-[10px] normal-case tracking-normal text-brand" title="Manually edited; AI re-runs and re-imports keep this value">
            <span aria-hidden className="size-1.5 rounded-full bg-brand" />
            edited
          </span>
        ) : null}
      </Label>
      <div className="flex items-center gap-2">
        {extra}
        <ConfidenceChip score={score} label="confidence" />
      </div>
    </div>
  );
}

function Counter({ n, max }: { n: number; max: number }) {
  const over = n > max;
  return (
    <span className={cn("num text-[11px]", over ? "text-destructive" : "text-ink-muted")} aria-live="polite">
      {n}/{max}
      {over ? " (too long)" : ""}
    </span>
  );
}

/**
 * The editable AI listing. Mount with a key of `${id}:${version}` so a fresh detail resets the form.
 * The description preview renders HTML with dangerouslySetInnerHTML: the draft was sanitised by
 * `sanitizeDescriptionHtml` when the AI wrote it and again on every PATCH, so the browser only ever sees allow-listed tags.
 */
export function ReviewListing({
  storeSlug,
  detail,
  pinned,
  onHover,
  onSelect,
  onSaved,
  onReload,
}: {
  storeSlug: string;
  detail: ProductDetail;
  pinned: SourceHighlight | null;
  onHover: (h: SourceHighlight | null) => void;
  onSelect: (h: SourceHighlight) => void;
  onSaved: () => void;
  onReload: () => void;
}) {
  const uid = useId();
  const { product } = detail;
  const base = useMemo<ProductContent>(() => product.draft ?? EMPTY_CONTENT, [product.draft]);
  const [form, setForm] = useState<ProductContent>(base);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  // Success is reported by the drawer: a save bumps the version, which remounts this form and would drop a local notice.
  const [notice, setNotice] = useState<{ tone: "error" | "conflict"; text: string } | null>(null);

  const patch = useMemo(() => diffContent(base, form), [base, form]);
  const dirty = Object.keys(patch).length > 0;
  const overrides = product.manualOverrides;
  const conf = product.confidence;
  const set = <K extends keyof ProductContent>(key: K, value: ProductContent[K]) => setForm((f) => ({ ...f, [key]: value }));
  const noDraft = product.draft === null;

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      await api(`${storeApi(storeSlug)}/products/${product.id}`, { method: "PATCH", json: { version: product.version, ...patch } });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setNotice({ tone: "conflict", text: err.message });
      else setNotice({ tone: "error", text: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {noDraft ? <p className="border border-dashed border-border bg-card px-3 py-2 text-xs text-ink-muted">The AI has not written this product yet. You can still prefill fields; they become manual overrides.</p> : null}

      <div className="flex flex-col gap-1.5">
        <FieldHead htmlFor={`${uid}-title`} label="Title" score={conf.title} edited={overrides.title !== undefined} />
        <Input id={`${uid}-title`} value={form.title ?? ""} maxLength={200} onChange={(e) => set("title", orNull(e.target.value))} className="font-display text-base md:text-base" />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldHead htmlFor={`${uid}-category`} label="Category" score={conf.category} edited={overrides.category !== undefined} />
        <Input id={`${uid}-category`} list={`${uid}-taxonomy`} value={form.category ?? ""} maxLength={200} placeholder="Home & Garden > …" onChange={(e) => set("category", orNull(e.target.value))} className="text-sm" />
        <datalist id={`${uid}-taxonomy`}>
          {TAXONOMY.map((path) => (
            <option key={path} value={path} />
          ))}
        </datalist>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldHead
          htmlFor={`${uid}-description`}
          label="Description"
          score={conf.description}
          edited={overrides.descriptionHtml !== undefined}
          extra={
            <Button type="button" variant="ghost" size="xs" aria-pressed={preview} onClick={() => setPreview((p) => !p)} className="cursor-pointer">
              {preview ? <CodeIcon data-icon="inline-start" /> : <EyeIcon data-icon="inline-start" />}
              {preview ? "Edit HTML" : "Preview"}
            </Button>
          }
        />
        {preview ? (
          <div className="prose-product min-h-24 border border-border bg-card px-3 py-2 text-sm text-ink" dangerouslySetInnerHTML={{ __html: form.descriptionHtml ?? "<p class=\"text-ink-muted\">Empty</p>" }} />
        ) : (
          <Textarea id={`${uid}-description`} value={form.descriptionHtml ?? ""} maxLength={50_000} rows={8} spellCheck={false} onChange={(e) => set("descriptionHtml", orNull(e.target.value))} className="min-h-32 font-mono text-xs md:text-xs" />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldHead htmlFor={`${uid}-tags`} label="Tags" score={conf.tags} edited={overrides.tags !== undefined} />
        <TagEditor id={`${uid}-tags`} value={form.tags} onChange={(tags) => set("tags", tags)} />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldHead htmlFor={`${uid}-attributes`} label="Attributes" score={conf.attributes} edited={overrides.attributes !== undefined} />
        <div id={`${uid}-attributes`}>
          <AttributesEditor value={form.attributes} onChange={(attributes) => set("attributes", attributes)} />
        </div>
      </div>

      <fieldset className="flex flex-col gap-2 border border-border bg-card/60 p-3">
        <legend className="px-1 text-xs font-medium uppercase tracking-wide text-ink-muted">SEO</legend>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <Label htmlFor={`${uid}-meta-title`} className="text-xs">
              Meta title
            </Label>
            <Counter n={(form.seo.metaTitle ?? "").length} max={META_TITLE_MAX} />
          </div>
          <Input id={`${uid}-meta-title`} value={form.seo.metaTitle ?? ""} maxLength={80} onChange={(e) => set("seo", { ...form.seo, metaTitle: orNull(e.target.value) })} className="h-7 text-xs md:text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <Label htmlFor={`${uid}-meta-description`} className="text-xs">
              Meta description
            </Label>
            <Counter n={(form.seo.metaDescription ?? "").length} max={META_DESCRIPTION_MAX} />
          </div>
          <Textarea id={`${uid}-meta-description`} value={form.seo.metaDescription ?? ""} maxLength={200} rows={2} onChange={(e) => set("seo", { ...form.seo, metaDescription: orNull(e.target.value) })} className="min-h-12 text-xs md:text-xs" />
        </div>
      </fieldset>

      <ClaimInspector claims={product.claims} guardrails={product.guardrails ?? []} pinned={pinned} onHover={onHover} onSelect={onSelect} />

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-border bg-popover px-4 py-2">
        <Button type="submit" size="sm" disabled={!dirty || saving} className="cursor-pointer">
          <SaveIcon data-icon="inline-start" />
          {saving ? "Saving…" : dirty ? "Save changes" : "No changes"}
        </Button>
        {dirty && !saving ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setForm(base)} className="cursor-pointer">
            Discard
          </Button>
        ) : null}
        {notice ? (
          <span role="status" className="flex flex-wrap items-center gap-2 text-xs text-destructive">
            {notice.text}
            {notice.tone === "conflict" ? (
              <Button type="button" variant="outline" size="xs" onClick={onReload} className="cursor-pointer">
                Reload
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>
    </form>
  );
}
