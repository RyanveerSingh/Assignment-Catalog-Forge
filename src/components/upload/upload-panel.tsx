"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState } from "react";
import { type FileRejection, useDropzone } from "react-dropzone";
import { DatabaseIcon, FileArchiveIcon, FileSpreadsheetIcon, ImageIcon, LinkIcon, UploadIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseGoogleSheetsUrl } from "@/core/parse/google-sheets";
import { storeApi } from "@/lib/client/api";
import { FileRow, formatBytes } from "./file-row";
import { DEFAULT_UPLOAD_OPTIONS, UploadOptions, type UploadOptionsValue } from "./upload-options";

const MB = 1024 * 1024;
/** Mirrors the server defaults (MAX_SHEET_BYTES, MAX_PHOTO_BYTES, MAX_ZIP_BYTES); the server re-checks (EC-A3). */
const LIMITS = { sheet: 50 * MB, photo: 25 * MB, zip: 200 * MB } as const;
const SHEET_EXT = new Set(["csv", "xlsx", "xls", "sql"]);
const PHOTO_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif"]);
const ACCEPT = {
  "text/csv": [".csv"],
  "text/plain": [".csv", ".sql"],
  "application/sql": [".sql"],
  "application/x-sql": [".sql"],
  "application/vnd.ms-excel": [".xls", ".csv"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/gif": [".gif"],
  "application/zip": [".zip"],
  "application/x-zip-compressed": [".zip"],
};
type Kind = "sheet" | "photo" | "zip";
type Phase = "idle" | "uploading" | "processing";
/** A validated Google Sheets link standing in for the sheet file (EC-A23). */
interface SheetLink {
  url: string;
  sheetId: string;
  gid: string | null;
}

function extensionOf(name: string): string {
  return name.toLowerCase().split(".").pop() ?? "";
}

function kindOf(file: File): Kind | null {
  const ext = extensionOf(file.name);
  if (SHEET_EXT.has(ext)) return "sheet";
  if (PHOTO_EXT.has(ext)) return "photo";
  if (ext === "zip") return "zip";
  return null;
}

/** EC-A1 (empty), EC-A3 (limits) and the accepted extensions. EC-A2 (a lying extension) is settled by the server's magic-byte sniff. */
function validate(file: File): { kind: Kind } | { error: string } {
  const kind = kindOf(file);
  if (!kind) return { error: `${file.name}: not a supported type. Sheets are .csv, .xlsx, .xls or a .sql dump; photos are .png, .jpg, .jpeg, .webp or .gif; or one .zip of photos.` };
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
      return "The sheet is not a CSV, XLSX or SQL file.";
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
  const [sheetLink, setSheetLink] = useState<SheetLink | null>(null);
  const [linkText, setLinkText] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [options, setOptions] = useState<UploadOptionsValue>(DEFAULT_UPLOAD_OPTIONS);
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
        if (sheetLink) notes.push(`Replaced the Google Sheets link with ${nextSheet.name} (one sheet per import)`);
        setSheet(nextSheet);
        setSheetLink(null);
      }
      if (nextPhotos.length > 0) setPhotos((prev) => [...prev, ...nextPhotos.filter((f) => !prev.some((p) => sameFile(p, f)))]);
      setProblems(errs);
      setNotices(notes);
      setServerError(null);
      setReused(null);
    },
    [sheet, sheetLink],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: ACCEPT, multiple: true, disabled: busy });

  /** The link is only validated here; the server fetches it when the import starts (EC-A23). */
  const applyLink = (): void => {
    const url = linkText.trim();
    if (url === "" || busy) return;
    const ref = parseGoogleSheetsUrl(url);
    if (!ref) {
      setProblems(["That is not a Google Sheets link. Copy it from the browser address bar or from Share → Copy link."]);
      return;
    }
    const notes: string[] = [];
    if (sheet) notes.push(`Replaced ${sheet.name} with the Google Sheets link (one sheet per import)`);
    setSheet(null);
    setSheetLink({ url, sheetId: ref.sheetId, gid: ref.gid });
    setLinkText("");
    setProblems([]);
    setNotices(notes);
    setServerError(null);
    setReused(null);
  };

  const start = (): void => {
    if ((!sheet && !sheetLink) || busy) return;
    const dollars = Number(options.budget);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setProblems(["Enter an AI budget above $0"]);
      return;
    }
    const form = new FormData();
    if (sheetLink) form.append("sheetUrl", sheetLink.url);
    else if (sheet) form.append("sheet", sheet, sheet.name);
    for (const p of photos) form.append("photos", p, p.name);
    form.append("mode", options.mode);
    form.append("budgetCents", String(Math.round(dollars * 100)));
    form.append("autoPublish", String(options.autoPublish));

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
  const sheetSummary = sheetLink ? "1 Google Sheet" : sheet ? "1 sheet" : "no sheet";
  const summary = [sheetSummary, photoCount > 0 ? `${photoCount} photo${photoCount === 1 ? "" : "s"}` : null, zipCount > 0 ? `${zipCount} ZIP` : null, totalBytes > 0 ? formatBytes(totalBytes) : null]
    .filter((s) => s !== null)
    .join(" · ");
  const pct = Math.round(progress * 100);
  const processingText = sheetLink ? "Upload complete · fetching the Google Sheet and queueing the import…" : "Upload complete · storing files and queueing the import…";

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
        <p className="max-w-md text-xs text-ink-muted">
          One CSV, XLSX or XLS up to 50 MB, or a SQL dump (.sql from mysqldump / pg_dump; read, never executed). Photos as PNG, JPG, WEBP or GIF up to 25 MB each, or one ZIP up to 200 MB. Pasting files works too.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${uid}-link`} className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">
          Or paste a Google Sheets link
        </label>
        <div className="flex gap-2">
          <Input
            id={`${uid}-link`}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            value={linkText}
            disabled={busy}
            onChange={(e) => setLinkText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
            }}
            aria-describedby={`${uid}-link-hint`}
            className="bg-card"
          />
          <Button variant="outline" onClick={applyLink} disabled={busy || linkText.trim() === ""} className="shrink-0 cursor-pointer">
            <LinkIcon data-icon="inline-start" aria-hidden />
            Use link
          </Button>
        </div>
        <p id={`${uid}-link-hint`} className="text-xs text-ink-muted">
          The sheet must be shared as Anyone with the link → Viewer. The tab in the link (#gid) is used, otherwise the first tab.
        </p>
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

      {sheet || sheetLink || photos.length > 0 ? (
        <ul className="max-h-56 divide-y divide-border overflow-y-auto bg-card text-sm hairline" aria-label="Selected files">
          {sheet ? (
            <FileRow icon={extensionOf(sheet.name) === "sql" ? DatabaseIcon : FileSpreadsheetIcon} label={extensionOf(sheet.name) === "sql" ? "Dump" : "Sheet"} name={sheet.name} size={sheet.size} disabled={busy} onRemove={() => setSheet(null)} />
          ) : null}
          {sheetLink ? <FileRow icon={LinkIcon} label="Link" name={sheetLink.url} detail={sheetLink.gid === null ? "first tab" : `gid ${sheetLink.gid}`} disabled={busy} onRemove={() => setSheetLink(null)} /> : null}
          {photos.map((p, idx) => (
            <FileRow
              key={`${p.name}-${p.size}-${p.lastModified}`}
              icon={kindOf(p) === "zip" ? FileArchiveIcon : ImageIcon}
              label={kindOf(p) === "zip" ? "ZIP" : "Photo"}
              name={p.name}
              size={p.size}
              disabled={busy}
              onRemove={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
            />
          ))}
        </ul>
      ) : null}

      <UploadOptions uid={uid} value={options} onChange={setOptions} disabled={busy} />

      {busy ? (
        <div>
          <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1.5 w-full bg-paper-deep">
            <div className="h-full bg-brand transition-[width] duration-200" style={{ width: `${pct}%` }} />
          </div>
          <p className="num mt-1 text-xs text-ink-muted" aria-live="polite">
            {phase === "processing" ? processingText : `Uploading ${pct}% · ${formatBytes(totalBytes * progress)} of ${formatBytes(totalBytes)}`}
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
        <Button onClick={start} disabled={(!sheet && !sheetLink) || busy} className="cursor-pointer bg-brand text-brand-foreground hover:bg-brand/90">
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
