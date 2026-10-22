"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState } from "react";
import { type FileRejection, useDropzone } from "react-dropzone";
import { FileArchiveIcon, FileSpreadsheetIcon, ImageIcon, type LucideIcon, UploadIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { storeApi } from "@/lib/client/api";

const MB = 1024 * 1024;
/** Mirrors the server defaults (MAX_SHEET_BYTES, MAX_PHOTO_BYTES, MAX_ZIP_BYTES); the server re-checks (EC-A3). */
const LIMITS = { sheet: 50 * MB, photo: 25 * MB, zip: 200 * MB } as const;
const SHEET_EXT = new Set(["csv", "xlsx", "xls"]);
const PHOTO_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const ACCEPT = {
  "text/csv": [".csv"],
  "text/plain": [".csv"],
  "application/vnd.ms-excel": [".xls", ".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "application/zip": [".zip"],
  "application/x-zip-compressed": [".zip"],
};
const MODES = [
  { value: "fast", label: "Fast", hint: "Realtime API. Results in minutes." },
  { value: "economy", label: "Economy", hint: "Batch API, about 50% cheaper, slower (up to hours)." },
] as const;
type Mode = (typeof MODES)[number]["value"];
type Kind = "sheet" | "photo" | "zip";
type Phase = "idle" | "uploading" | "processing";

function kindOf(file: File): Kind | null {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (SHEET_EXT.has(ext)) return "sheet";
  if (PHOTO_EXT.has(ext)) return "photo";
  if (ext === "zip") return "zip";
  return null;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < MB) return `${Math.round(n / 1024)} KB`;
  return `${(n / MB).toFixed(1)} MB`;
}

/** EC-A1 (empty), EC-A3 (limits) and the accepted extensions. EC-A2 (a lying extension) is settled by the server's magic-byte sniff. */
function validate(file: File): { kind: Kind } | { error: string } {
  const kind = kindOf(file);
  if (!kind) return { error: `${file.name}: not a supported type. Sheets are .csv, .xlsx or .xls; photos are .png, .jpg, .jpeg, .webp or .gif; or one .zip of photos.` };
  if (file.size === 0) return { error: `${file.name} is empty (0 bytes)` };
  if (file.size > LIMITS[kind]) {
    const noun = kind === "sheet" ? "Sheets" : kind === "zip" ? "ZIP archives" : "Photos";
    return { error: `${file.name} is ${formatBytes(file.size)}. ${noun} are limited to ${LIMITS[kind] / MB} MB.` };
  }
  return { kind };
}

function sameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

function parseBody(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === "object" && v !== null ? { ...v } : null;
  } catch {
    return null;
  }
}

function serverMessage(status: number, body: Record<string, unknown> | null): string {
  const err = body?.error;
  if (typeof err === "object" && err !== null && "message" in err && typeof err.message === "string") return err.message;
  switch (status) {
    case 401:
      return "Your session has expired. Sign in again and retry.";
    case 413:
      return "The upload is larger than the server accepts.";
    case 415:
      return "The sheet is not a CSV or XLSX file.";
    case 503:
      return "The database is temporarily unavailable; please retry.";
    default:
      return `Upload failed (HTTP ${status}).`;
  }
}

export function UploadPanel({ storeSlug }: { storeSlug: string }) {
  const router = useRouter();
  const uid = useId();
  const [sheet, setSheet] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("fast");
  const [budget, setBudget] = useState("5");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [reused, setReused] = useState<{ importId: string; warnings: string[] } | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const busy = phase !== "idle";

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      const errs: string[] = [];
      const notes: string[] = [];
      let nextSheet: File | null = null;
      const nextPhotos: File[] = [];
      for (const f of [...accepted, ...rejections.map((r) => r.file)]) {
        const v = validate(f);
        if ("error" in v) {
          errs.push(v.error);
          continue;
        }
        if (v.kind === "sheet") {
          if (nextSheet) notes.push(`${nextSheet.name} was skipped: one sheet per import`);
          nextSheet = f;
        } else {
          nextPhotos.push(f);
        }
      }
      if (nextSheet) {
        if (sheet && !sameFile(sheet, nextSheet)) notes.push(`Replaced ${sheet.name} with ${nextSheet.name} (one sheet per import)`);
        setSheet(nextSheet);
      }
      if (nextPhotos.length > 0) setPhotos((prev) => [...prev, ...nextPhotos.filter((f) => !prev.some((p) => sameFile(p, f)))]);
      setProblems(errs);
      setNotices(notes);
      setServerError(null);
      setReused(null);
    },
    [sheet],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: ACCEPT, multiple: true, disabled: busy });

  const start = (): void => {
    if (!sheet || busy) return;
    const dollars = Number(budget);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setProblems(["Enter an AI budget above $0"]);
      return;
    }
    const form = new FormData();
    form.append("sheet", sheet, sheet.name);
    for (const p of photos) form.append("photos", p, p.name);
    form.append("mode", mode);
    form.append("budgetCents", String(Math.round(dollars * 100)));

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    setPhase("uploading");
    setProgress(0);
    setProblems([]);
    setServerError(null);
    setReused(null);
    xhr.open("POST", `${storeApi(storeSlug)}/imports`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(e.loaded / e.total);
    };
    xhr.upload.onload = () => setPhase("processing");
    xhr.onload = () => {
      xhrRef.current = null;
      const body = parseBody(xhr.responseText);
      const importId = typeof body?.importId === "string" ? body.importId : null;
      if (xhr.status === 202 && importId) {
        router.push(`/app/${storeSlug}/upload/${importId}`);
        return;
      }
      if (xhr.status === 200 && importId) {
        const warnings = Array.isArray(body?.warnings) ? body.warnings.filter((w): w is string => typeof w === "string") : [];
        setReused({ importId, warnings });
        setPhase("idle");
        return;
      }
      setServerError(serverMessage(xhr.status, body));
      setPhase("idle");
    };
    xhr.onerror = () => {
      xhrRef.current = null;
      setServerError("The upload did not reach the server. Check your connection and try again.");
      setPhase("idle");
    };
    xhr.onabort = () => {
      xhrRef.current = null;
      setProgress(0);
      setPhase("idle");
    };
    xhr.send(form);
  };

  const cancelUpload = (): void => xhrRef.current?.abort();
  const totalBytes = (sheet?.size ?? 0) + photos.reduce((n, p) => n + p.size, 0);
  const zipCount = photos.filter((p) => kindOf(p) === "zip").length;
  const photoCount = photos.length - zipCount;
  const summary = [sheet ? "1 sheet" : "no sheet", photoCount > 0 ? `${photoCount} photo${photoCount === 1 ? "" : "s"}` : null, zipCount > 0 ? `${zipCount} ZIP` : null, totalBytes > 0 ? formatBytes(totalBytes) : null]
    .filter((s) => s !== null)
    .join(" · ");
  const pct = Math.round(progress * 100);

  return (
    <div className="flex flex-col gap-4">
      <div
        {...getRootProps({
          role: "button",
          "aria-label": "Drop a supplier sheet and photos here, or press Enter to browse",
          className: cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 border border-dashed px-6 py-10 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand",
            isDragActive ? "border-brand bg-brand-soft/60" : "border-input bg-card hover:bg-paper-deep/40",
            busy && "pointer-events-none opacity-60",
          ),
        })}
      >
        <input {...getInputProps()} />
        <UploadIcon className="size-5 text-brand" aria-hidden />
        <p className="text-sm font-medium text-ink">{isDragActive ? "Release to add the files" : "Drop a supplier sheet and photos here, or click to browse"}</p>
        <p className="max-w-md text-xs text-ink-muted">One CSV, XLSX or XLS up to 50 MB. Photos as PNG, JPG, WEBP or GIF up to 25 MB each, or one ZIP up to 200 MB. Pasting files works too.</p>
      </div>

      {problems.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-1 border-l-[3px] border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      {notices.length > 0 ? (
        <ul role="status" className="flex flex-col gap-1 border-l-[3px] border-info bg-info-soft px-3 py-2 text-sm text-info">
          {notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}

      {sheet || photos.length > 0 ? (
        <ul className="max-h-56 divide-y divide-border overflow-y-auto bg-card text-sm hairline" aria-label="Selected files">
          {sheet ? <FileRow icon={FileSpreadsheetIcon} label="Sheet" file={sheet} disabled={busy} onRemove={() => setSheet(null)} /> : null}
          {photos.map((p, idx) => (
            <FileRow
              key={`${p.name}-${p.size}-${p.lastModified}`}
              icon={kindOf(p) === "zip" ? FileArchiveIcon : ImageIcon}
              label={kindOf(p) === "zip" ? "ZIP" : "Photo"}
              file={p}
              disabled={busy}
              onRemove={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
            />
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <fieldset className="flex min-w-0 flex-col gap-1.5">
          <legend className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-muted">AI mode</legend>
          <div className="grid grid-cols-2 gap-px bg-border hairline">
            {MODES.map((m) => (
              <label
                key={m.value}
                className={cn(
                  "flex cursor-pointer flex-col gap-0.5 bg-card px-3 py-2 transition-colors has-[:checked]:bg-brand-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand has-[:focus-visible]:ring-inset",
                  busy && "cursor-not-allowed opacity-60",
                )}
              >
                <input type="radio" name={`${uid}-mode`} value={m.value} checked={mode === m.value} disabled={busy} onChange={() => setMode(m.value)} className="sr-only" />
                <span className="text-sm font-medium text-ink">{m.label}</span>
                <span className="text-xs text-ink-muted">{m.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-budget`} className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">
            AI budget
          </label>
          <div className="relative">
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-ink-muted">
              $
            </span>
            <Input id={`${uid}-budget`} type="number" inputMode="decimal" min={1} step={1} value={budget} disabled={busy} onChange={(e) => setBudget(e.target.value)} aria-describedby={`${uid}-budget-hint`} className="num bg-card pl-6" />
          </div>
          <p id={`${uid}-budget-hint`} className="text-xs text-ink-muted">
            The import pauses for your review when AI spend reaches this amount.
          </p>
        </div>
      </div>

      {busy ? (
        <div>
          <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1.5 w-full bg-paper-deep">
            <div className="h-full bg-brand transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
          <p className="num mt-1 text-xs text-ink-muted" aria-live="polite">
            {phase === "processing" ? "Upload complete · storing files and queueing the import…" : `Uploading ${pct}% · ${formatBytes(totalBytes * progress)} of ${formatBytes(totalBytes)}`}
          </p>
        </div>
      ) : null}

      {serverError ? (
        <p role="alert" className="border-l-[3px] border-destructive bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {serverError}
        </p>
      ) : null}
      {reused ? (
        <div role="status" className="flex flex-col gap-1 border-l-[3px] border-warning bg-warning-soft px-3 py-2 text-sm text-ink">
          {reused.warnings.map((w) => (
            <span key={w}>{w}</span>
          ))}
          <Link href={`/app/${storeSlug}/upload/${reused.importId}`} className="cursor-pointer font-medium text-brand underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
            Open the running import →
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={start} disabled={!sheet || busy} className="cursor-pointer bg-brand text-brand-foreground hover:bg-brand/90">
          <UploadIcon data-icon="inline-start" aria-hidden />
          {busy ? "Uploading…" : "Start import"}
        </Button>
        {busy ? (
          <Button variant="outline" onClick={cancelUpload} className="cursor-pointer">
            Cancel upload
          </Button>
        ) : null}
        <span className="text-xs text-ink-muted">{summary}</span>
      </div>
    </div>
  );
}

function FileRow({ icon: Icon, label, file, disabled, onRemove }: { icon: LucideIcon; label: string; file: File; disabled: boolean; onRemove: () => void }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <Icon className="size-4 shrink-0 text-ink-muted" aria-hidden />
      <span className="w-10 shrink-0 text-[10px] uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate text-ink" title={file.name}>
        {file.name}
      </span>
      <span className="num shrink-0 text-xs text-ink-muted">{formatBytes(file.size)}</span>
      <button
        type="button"
        aria-label={`Remove ${file.name}`}
        disabled={disabled}
        onClick={onRemove}
        className="cursor-pointer rounded-sm p-1 text-ink-muted transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <XIcon className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}
