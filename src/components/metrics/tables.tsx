"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { StoreMetrics } from "@/db/repositories/metrics";
import { formatDuration, formatMicrosUsd, formatNumber, formatRelative, modelLabel } from "@/lib/format";
import { COVERAGE_SERIES } from "./charts";

const MAX_EVAL_METRICS = 6;

function compact(n: number): string {
  return new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function formatMetric(v: number): string {
  if (Number.isInteger(v)) return formatNumber(v);
  return v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="font-display text-xl text-ink">
          {title}
        </h2>
        {hint ? <p className="text-xs text-ink-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function TableEmpty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-sm border border-dashed border-border px-4 py-6 text-center text-sm text-ink-muted">{children}</p>;
}

const NUM = "num text-right";

export function ModelTable({ models }: { models: StoreMetrics["models"] }) {
  return (
    <Section id="models-heading" title="Per model" hint="Every successful call grouped by model and job; token counts in thousands (K) or millions (M)">
      {models.length === 0 ? (
        <TableEmpty>No AI calls yet.</TableEmpty>
      ) : (
        <div className="rounded-sm bg-card hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Job</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right" title="Input tokens">
                  Tokens in
                </TableHead>
                <TableHead className="text-right" title="Output tokens">
                  Tokens out
                </TableHead>
                <TableHead className="text-right" title="Prompt-cache read tokens">
                  Reused
                </TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right" title="Average latency">
                  Typical
                </TableHead>
                <TableHead className="text-right" title="95th-percentile latency">
                  Slowest 5%
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.map((m) => (
                <TableRow key={`${m.model}:${m.purpose}`}>
                  <TableCell className="font-medium" title={m.model}>
                    {modelLabel(m.model)}
                  </TableCell>
                  <TableCell className="text-ink-muted">{m.purpose}</TableCell>
                  <TableCell className={NUM}>{formatNumber(m.calls)}</TableCell>
                  <TableCell className={NUM}>{compact(m.inputTokens)}</TableCell>
                  <TableCell className={NUM}>{compact(m.outputTokens)}</TableCell>
                  <TableCell className={NUM}>{compact(m.cacheReadTokens)}</TableCell>
                  <TableCell className={NUM}>{formatMicrosUsd(m.costMicros, 4)}</TableCell>
                  <TableCell className={NUM}>{formatDuration(m.avgLatencyMs)}</TableCell>
                  <TableCell className={NUM}>{formatDuration(m.p95LatencyMs)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

/** Table twin of the coverage chart (the WCAG-clean equivalent; numbers never hide behind colour). */
export function TranslationTable({ translations }: { translations: StoreMetrics["translations"] }) {
  if (translations.length === 0) return null;
  return (
    <div className="rounded-sm bg-card hairline">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Language</TableHead>
            {COVERAGE_SERIES.map((s) => (
              <TableHead key={s.key} className="text-right">
                {s.label}
              </TableHead>
            ))}
            <TableHead className="text-right">Coverage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {translations.map((t) => (
            <TableRow key={t.locale}>
              <TableCell className="font-medium uppercase">{t.locale}</TableCell>
              {COVERAGE_SERIES.map((s) => (
                <TableCell key={s.key} className={NUM}>
                  {formatNumber(t[s.key])}
                </TableCell>
              ))}
              <TableCell className={NUM}>{Math.round(t.coverage * 100)}%</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function EvalTable({ evals }: { evals: StoreMetrics["evals"] }) {
  return (
    <Section id="evals-heading" title="Quality checks" hint="The latest 20 eval runs: a prompt version's output scored against hand-checked answers">
      {evals.length === 0 ? (
        <TableEmpty>No eval runs yet. Run `npm run eval` to score a prompt version.</TableEmpty>
      ) : (
        <div className="rounded-sm bg-card hairline">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prompt</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Sample</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Metrics</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evals.map((e) => {
                const numeric = Object.entries(e.metrics)
                  .filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1]))
                  .slice(0, MAX_EVAL_METRICS);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="num">{e.promptVersion}</TableCell>
                    <TableCell className="text-ink-muted" title={e.model}>
                      {modelLabel(e.model)}
                    </TableCell>
                    <TableCell className="text-ink-muted">{e.sample}</TableCell>
                    <TableCell className="text-ink-muted">{formatRelative(e.createdAt)}</TableCell>
                    <TableCell className="whitespace-normal">
                      {numeric.length === 0 ? (
                        <span className="text-ink-muted">—</span>
                      ) : (
                        <ul className="flex flex-wrap gap-1.5">
                          {numeric.map(([k, v]) => (
                            <li key={k} className="inline-flex h-5 items-center gap-1 rounded-sm bg-muted px-1.5 text-[11px]">
                              <span className="text-ink-muted">{k}</span>
                              <span className="num text-ink">{formatMetric(v)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}
