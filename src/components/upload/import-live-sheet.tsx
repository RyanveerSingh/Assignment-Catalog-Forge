import { cn } from "cn";
import type { ColumnMapping, Issue } from "@/core/types";
import { Chip } from "@/components/ext/chip";
import { ConfidenceChip } from "@/components/ext/confidence-chip";
import { CARD } from "@/components/ext/surfaces";
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
    <section aria-labelledby="sheet-heading" className={cn(CARD, "w-full min-w-0")}>
      <div className="flex items-baseline justify-between border-b border-border px-5 py-3.5">
        <h2 id="sheet-heading" className="font-display text-base text-ink">
          Sheet
        </h2>
        {meta?.format ? <Chip tone="neutral">{meta.format.toUpperCase()}</Chip> : null}
      </div>
      {!meta ? (
        <p className="px-5 py-8 text-sm text-ink-muted">Not parsed yet.</p>
      ) : (
        <div className="flex flex-col gap-4 px-5 py-4 text-sm">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
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
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Column mapping</h3>
              <ul className="flex flex-wrap gap-1.5">
                {mappings.map((m) => (
                  <li key={m.index} className={cn("flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs ring-1 ring-inset", m.canonical ? "bg-card text-ink ring-border" : "bg-surface-2 text-ink-muted ring-transparent")}>
                    <span className="num max-w-[160px] truncate" title={m.originalHeader}>
                      {m.originalHeader || "(blank)"}
                    </span>
                    <span aria-hidden className="text-ink-muted">→</span>
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
      <dt className="text-[11px] text-ink-muted">{label}</dt>
      <dd className="num truncate text-[13px] font-medium text-ink" title={value ?? undefined}>
        {value ?? "—"}
        {warn ? <span className="ml-1 font-sans font-normal text-warning">· {warn}</span> : null}
      </dd>
    </div>
  );
}

const SEVERITY: Record<Issue["severity"], "brand" | "warning" | "danger"> = { info: "brand", warn: "warning", error: "danger" };

function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Sheet issues</h3>
      <ul className="flex flex-col gap-1.5 text-xs">
        {issues.map((i, idx) => (
          <li key={`${i.code}-${idx}`} className="flex items-start gap-2">
            <Chip tone={SEVERITY[i.severity]} className="h-5 px-2 text-[10px] uppercase">
              {i.severity}
            </Chip>
            <span className="min-w-0 break-words pt-0.5 text-ink" title={i.ec ? `${i.code} · EC-${i.ec}` : i.code}>
              {i.message}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
