"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState } from "react";
import { type FileRejection, useDropzone } from "react-dropzone";
import { ArrowRightIcon, DatabaseIcon, FileArchiveIcon, FileSpreadsheetIcon, ImageIcon, LinkIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "cn";
import { settle } from "@/components/ext/motion";
import { Button } from "@/components/ui/button";
import { parseGoogleSheetsUrl } from "@/core/parse/google-sheets";
import { storeApi } from "@/lib/client/api";
import { DropZoneFace } from "./drop-zone-face";
import { FileRow, formatBytes } from "./file-row";
import { SamplePills } from "./sample-pills";
import { DEFAULT_UPLOAD_OPTIONS, UploadOptions, type UploadOptionsValue } from "./upload-options";
import { ACCEPT, extensionOf, kindOf, parseBody, sameFile, serverMessage, type SheetLink, validateFile } from "./upload-validate";

type Phase = "idle" | "uploading" | "processing";

const NOTE = "flex flex-col gap-1 rounded-xl px-3.5 py-2.5 text-[13px]";

/**
 * The hero of the upload page: one raised card that takes drops anywhere on it, with the Google
 * Sheets field, the three options, the sample pills and the Start button beneath the drop face.
 */
export function UploadPanel({ storeSlug }: { storeSlug: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();
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
        const v = validateFile(f);
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

  // The whole card is the drop target; clicks are left to the Browse button so the fields inside stay usable.
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({ onDrop, accept: ACCEPT, multiple: true, disabled: busy, noClick: true, noKeyboard: true });

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
  const sheetSummary = sheetLink ? "1 Google Sheet" : sheet ? "1 sheet" : "no sheet yet";
  const summary = [sheetSummary, photoCount > 0 ? `${photoCount} photo${photoCount === 1 ? "" : "s"}` : null, zipCount > 0 ? `${zipCount} ZIP` : null, totalBytes > 0 ? formatBytes(totalBytes) : null]
    .filter((s) => s !== null)
    .join(" · ");
  const pct = Math.round(progress * 100);
  const processingText = sheetLink ? "Upload complete · fetching the Google Sheet and queueing the import…" : "Upload complete · storing files and queueing the import…";
  const hasFiles = Boolean(sheet || sheetLink || photos.length > 0);

  return (
    <section aria-label="Upload" className="relative">
      <div aria-hidden className="glow-top pointer-events-none absolute inset-x-0 -top-16 h-72" />
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={settle(reduce, 0.5)} className="relative">
        <div
          {...getRootProps({
            "aria-label": "Drop a supplier sheet and photos anywhere on this card",
            className: cn(
              "card-raised rounded-3xl p-5 transition-[transform,box-shadow] duration-200 ease-out md:p-8",
              isDragActive && "scale-[1.01] shadow-[0_0_0_2px_var(--brand),var(--shadow-float)]",
              busy && "pointer-events-none opacity-70",
            ),
          })}
        >
          <input {...getInputProps()} />
          <DropZoneFace active={isDragActive} disabled={busy} onBrowse={open} />

          <div className="mt-8 flex flex-col gap-5 border-t border-border pt-6">
            <div className="flex flex-col gap-2">
              <label htmlFor={`${uid}-link`} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-muted">
                Or paste a Google Sheets link
              </label>
              <div className="flex max-w-2xl gap-2">
                <div className="relative min-w-0 flex-1">
                  <LinkIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-muted" />
                  <input
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
                    className="h-11 w-full rounded-full bg-card pr-4 pl-10 text-sm text-ink ring-1 ring-border outline-none placeholder:text-ink-muted/70 focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
                  />
                </div>
                <Button variant="outline" size="lg" onClick={applyLink} disabled={busy || linkText.trim() === ""} className="shrink-0 cursor-pointer rounded-full">
                  Use link
                </Button>
              </div>
              <p id={`${uid}-link-hint`} className="text-xs text-ink-muted">
                Share the sheet as Anyone with the link → Viewer. The tab in the link (#gid) is used, otherwise the first tab.
              </p>
            </div>

            {problems.length > 0 ? (
              <ul role="alert" className={cn(NOTE, "bg-destructive/5 text-destructive ring-1 ring-destructive/20")}>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
            {notices.length > 0 ? (
              <ul role="status" className={cn(NOTE, "bg-brand-soft text-brand")}>
                {notices.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}

            {hasFiles ? (
              <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-2xl bg-surface-2/50 ring-1 ring-border" aria-label="Selected files">
                <AnimatePresence>
                  {sheet ? (
                    <FileRow key="sheet" index={0} icon={extensionOf(sheet.name) === "sql" ? DatabaseIcon : FileSpreadsheetIcon} label={extensionOf(sheet.name) === "sql" ? "Dump" : "Sheet"} name={sheet.name} size={sheet.size} disabled={busy} onRemove={() => setSheet(null)} />
                  ) : null}
                  {sheetLink ? <FileRow key="link" index={0} icon={LinkIcon} label="Link" name={sheetLink.url} detail={sheetLink.gid === null ? "first tab" : `gid ${sheetLink.gid}`} disabled={busy} onRemove={() => setSheetLink(null)} /> : null}
                  {photos.map((p, idx) => (
                    <FileRow
                      key={`${p.name}-${p.size}-${p.lastModified}`}
                      index={idx + 1}
                      icon={kindOf(p) === "zip" ? FileArchiveIcon : ImageIcon}
                      label={kindOf(p) === "zip" ? "ZIP" : "Photo"}
                      name={p.name}
                      size={p.size}
                      disabled={busy}
                      onRemove={() => setPhotos((prev) => prev.filter((_, i) => i !== idx))}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            ) : null}

            <UploadOptions uid={uid} value={options} onChange={setOptions} disabled={busy} />

            {busy ? (
              <div>
                <div role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full origin-left rounded-full bg-brand transition-transform duration-200" style={{ transform: `scaleX(${progress})` }} />
                </div>
                <p className="num mt-1.5 text-xs text-ink-muted" aria-live="polite">
                  {phase === "processing" ? processingText : `Uploading ${pct}% · ${formatBytes(totalBytes * progress)} of ${formatBytes(totalBytes)}`}
                </p>
              </div>
            ) : null}

            {serverError ? (
              <p role="alert" className={cn(NOTE, "bg-destructive/5 text-destructive ring-1 ring-destructive/20")}>
                {serverError}
              </p>
            ) : null}
            {reused ? (
              <div role="status" className={cn(NOTE, "bg-warning-soft text-ink")}>
                {reused.warnings.map((w) => (
                  <span key={w}>{w}</span>
                ))}
                <Link href={`/app/${storeSlug}/upload/${reused.importId}`} className="inline-flex cursor-pointer items-center gap-1 font-medium text-brand underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none">
                  Open the running import <ArrowRightIcon className="size-3.5" aria-hidden />
                </Link>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-border pt-5">
              <Button size="lg" onClick={start} disabled={(!sheet && !sheetLink) || busy} className="cursor-pointer rounded-full px-6 motion-safe:active:scale-[0.97]">
                {busy ? "Uploading…" : "Start import"}
                <ArrowRightIcon data-icon="inline-end" aria-hidden />
              </Button>
              {busy ? (
                <Button variant="outline" size="lg" onClick={cancelUpload} className="cursor-pointer rounded-full">
                  Cancel upload
                </Button>
              ) : null}
              <span className="num text-xs text-ink-muted">{summary}</span>
              <div className="ml-auto">
                <SamplePills disabled={busy} />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
