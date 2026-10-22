"use client";

import Link from "next/link";
import type { StoreMetrics } from "@/db/repositories/metrics";
import { formatDuration, formatNumber } from "@/lib/format";
import { MiniStat } from "./stat";

function ImportLink({ storeSlug, imp }: { storeSlug: string; imp: { id: string; name: string } }) {
  return (
    <Link href={`/app/${encodeURIComponent(storeSlug)}/upload/${encodeURIComponent(imp.id)}`} className="cursor-pointer underline underline-offset-2 hover:text-ink">
      {imp.name}
    </Link>
  );
}

export function SpeedSection({ speed, storeSlug }: { speed: StoreMetrics["speed"]; storeSlug: string }) {
  return (
    <section aria-labelledby="speed-heading" className="space-y-3">
      <h2 id="speed-heading" className="font-display text-xl text-ink">
        Speed
      </h2>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniStat label="Avg rows per minute" value={speed.avgRowsPerMinute === null ? "—" : formatNumber(speed.avgRowsPerMinute)} hint="across completed imports" />
        <MiniStat
          label="Fastest import"
          value={speed.fastestImport ? `${formatNumber(speed.fastestImport.rowsPerMinute)} rows/min` : "—"}
          hint={speed.fastestImport ? <ImportLink storeSlug={storeSlug} imp={speed.fastestImport} /> : "no completed imports"}
        />
        <MiniStat
          label="Slowest import"
          value={speed.slowestImport ? `${formatNumber(speed.slowestImport.rowsPerMinute)} rows/min` : "—"}
          hint={speed.slowestImport ? <ImportLink storeSlug={storeSlug} imp={speed.slowestImport} /> : "no completed imports"}
        />
        <MiniStat label="AI latency" value={speed.avgAiLatencyMs === null ? "—" : formatDuration(speed.avgAiLatencyMs)} hint={speed.p95AiLatencyMs === null ? "average per call" : `average · p95 ${formatDuration(speed.p95AiLatencyMs)}`} />
      </dl>
    </section>
  );
}
