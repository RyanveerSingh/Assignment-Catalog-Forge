import { cn } from "cn";
import type { ColumnMapping, Issue } from "@/core/types";
import { ConfidenceChip } from "@/components/ext/confidence-chip";
import { formatNumber } from "@/lib/format";
import type { ImportDto } from "./import-live-types";

function isColumnMapping(v: unknown): v is ColumnMapping {
  if (typeof v !== "object" || v === null) return false;
  const o: Record<string, unknown> = { ...v };
  return typeof o.header === "string" && typeof o.originalHeader === "string" && typeof o.index === "number" && typeof o.confidence === "number" && (o.canonical === null || typeof o.canonical === "string");
}

function describeDelimiter(d: string | undefined): string | null {
  if (d === undefined) return null;
  if (d === "\t") return "tab";
  if (d === ";") return "; semicolon";
  if (d === ",") return ", comma";
  if (d === "|") return "| pipe";
  return d;
}

export function SheetCard({ imp }: { imp: ImportDto }) {
  const meta = imp.parseMeta;
  const mappings = (imp.columnMap ?? []).filter(isColumnMapping);
  // ingest.ts writes a few fields beyond the declared ImportParseMeta shape; read them defensively.
  const extra: Record<string, unknown> = meta ? { ...meta } : {};
  const totalInFile = typeof extra.totalRowsInFile === "number" ? extra.totalRowsInFile : null;
  const mappedCount = typeof extra.mappedCount === "number" ? extra.mappedCount : mappings.filter((m) => m.canonical !== null).length;
  const priceLocale = typeof extra.priceLocale === "string" ? extra.priceLocale : null;
  const truncated = extra.truncated === true;
  const issues = meta?.issues ?? [];
  return (
    <section aria-labelledby="sheet-heading" className="bg-card hairline">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h2 id="sheet-heading" className="font-display text-lg text-ink">
          Sheet
        </h2>
        {meta?.format ? <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-ink-muted">{meta.format}</span> : null}
      </div>
      {!meta ? (
        <p className="px-4 py-6 text-sm text-ink-muted">Not parsed yet.</p>
      ) : (
        <div className="flex flex-col gap-4 px-4 py-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            <Fact label="Encoding" value={meta.encoding} />
            <Fact label="Delimiter" value={describeDelimiter(meta.delimiter)} />
            <Fact label="Sheet" value={meta.sheetName} />
            <Fact label="Header row" value={meta.headerRowIndex !== undefined ? `row ${meta.headerRowIndex + 1}` : null} />
            <Fact label="Rows in file" value={totalInFile !== null ? formatNumber(totalInFile) : null} warn={truncated ? `cut to ${formatNumber(imp.totalRows)}` : undefined} />
            <Fact label="Mapped columns" value={`${mappedCount} of ${mappings.length || meta.headers?.length || 0}`} />
            {priceLocale ? <Fact label="Price locale" value={priceLocale} /> : null}
          </dl>
          {mappings.length > 0 ? (
            <div>
              <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-muted">Column mapping</h3>
              <ul className="flex flex-wrap gap-1.5">
                {mappings.map((m) => (
                  <li key={m.index} className={cn("flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-xs ring-1 ring-inset", m.canonical ? "bg-card text-ink ring-border" : "bg-muted text-ink-muted ring-transparent")}>
                    <span className="num max-w-[160px] truncate" title={m.originalHeader}>
                      {m.originalHeader || "(blank)"}
                    </span>
                    <span aria-hidden>→</span>
                    <span className="sr-only">maps to</span>
                    {m.canonical ? (
                      <>
                        <span className="font-medium">{m.canonical}</span>
                        <ConfidenceChip score={m.confidence} />
                      </>
                    ) : (
                      <span className="italic">unmapped · kept as attribute</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {issues.length > 0 ? <IssueList issues={issues} /> : null}
        </div>
      )}
    </section>
  );
}

function Fact({ label, value, warn }: { label: string; value: string | null | undefined; warn?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd className="num truncate text-xs text-ink" title={value ?? undefined}>
        {value ?? "—"}
        {warn ? <span className="ml-1 font-sans text-warning">· {warn}</span> : null}
      </dd>
    </div>
  );
}

const SEVERITY_TEXT: Record<Issue["severity"], string> = { info: "text-info", warn: "text-warning", error: "text-destructive" };

function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-muted">Sheet issues</h3>
      <ul className="flex flex-col gap-1 text-xs">
        {issues.map((i, idx) => (
          <li key={`${i.code}-${idx}`} className="flex gap-2">
            <span className={cn("w-10 shrink-0 uppercase tracking-wide", SEVERITY_TEXT[i.severity])}>{i.severity}</span>
            <span className="min-w-0 break-words text-ink">
              {i.message}
              {i.ec ? <span className="text-ink-muted"> · EC-{i.ec}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
