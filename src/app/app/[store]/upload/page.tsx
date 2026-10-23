import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { serializeImport } from "@/lib/serializers";
import { PageHeader } from "@/components/ext/page-header";
import { ImportsTable } from "@/components/upload/imports-table";
import { UploadPanel } from "@/components/upload/upload-panel";
import { getDb } from "@/db/client";
import { listImports } from "@/db/repositories/imports";
import { optionalStore } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Upload" };

/** Served by /api/samples/[name]; descriptions follow samples/README.md. */
const SAMPLES: ReadonlyArray<{ name: string; what: string }> = [
  { name: "tiny-10.csv", what: "10 clean rows, 4 products, explicit parent SKU. The smoke test." },
  { name: "messy-120.csv", what: "Every mess at once: EN/DE headers, BOM, EU prices, scattered variants, duplicates, SKU conflicts." },
  { name: "messy-120.xlsx", what: "Same data as a workbook: two title rows above the header and an extra empty sheet." },
  { name: "photos-messy.zip", what: "56 photos for messy-120: SKU names, stems, fuzzy names, junk files and traversal paths." },
  { name: "new-12.csv", what: "12 products seen in no other sample, 26 rows: German and French rows, £8 / EUR 24 / 1.299,00 € / n/a prices, lbs and inches, a script tag, a SKU conflict, a row with no SKU." },
  { name: "photos-new-12.zip", what: "18 photos for new-12: 13 by SKU, two by stem, one known only from the Image column, one camera name with the SKU inside it, one orphan." },
  { name: "dump-mysql.sql", what: "A mysqldump of a product table: DROP and CREATE statements, two tables, escaped quotes, a NULL price. Parsed in memory, never executed." },
  { name: "semicolon-eu.csv", what: "German ;-export: 12,50 and 1.299,00 € prices, kg weights, German colours, no parent column." },
  { name: "broken-latin1.csv", what: "windows-1252 bytes: umlauts, ß and € that must be re-decoded." },
  { name: "no-header.csv", what: "Data rows with no header row at all." },
  { name: "header-only.csv", what: "A header and nothing else." },
  { name: "empty.csv", what: "0 bytes. Refused before anything is uploaded (A1)." },
  { name: "fake.csv", what: "An HTML login page saved as .csv. Sniffed and rejected (A2)." },
  { name: "bulk-1000.csv", what: "1,000 rows, 477 products: 16% messy, 30 duplicates, SKU conflicts, scattered variants." },
  { name: "bulk-10000.csv", what: "10,000 rows, 2.75 MB: the row cap and the queue under load (A14)." },
];

function SamplesCard() {
  return (
    <aside aria-labelledby="samples-heading" className="self-start bg-card hairline">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h2 id="samples-heading" className="font-display text-lg text-ink">
          Sample files
        </h2>
        <span className="text-[11px] text-ink-muted">download, then drop</span>
      </div>
      <ul className="divide-y divide-border">
        {SAMPLES.map((s) => (
          <li key={s.name}>
            <a
              href={`/api/samples/${s.name}`}
              download
              className="group flex cursor-pointer items-start gap-3 px-4 py-2 transition-colors hover:bg-paper-deep/40 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset focus-visible:outline-none"
            >
              <DownloadIcon className="mt-0.5 size-3.5 shrink-0 text-ink-muted transition-colors group-hover:text-brand" aria-hidden />
              <span className="min-w-0">
                <span className="num block text-xs text-ink">{s.name}</span>
                <span className="block text-xs text-ink-muted">{s.what}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export default async function UploadPage({ params }: { params: Promise<{ store: string }> }) {
  const { store: slug } = await params;
  const ctx = await optionalStore(slug);
  if (!ctx) redirect("/login");
  const rows = await listImports(getDb(), ctx.store.id, { limit: 25 });
  const imports = rows.map(serializeImport);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Imports"
        title="Upload a supplier sheet"
        description="Drop a CSV, XLSX or SQL dump, or paste a Google Sheets link, with any photos. Parsing, cleaning, grouping and AI writing run in the background; every row stays visible while it happens."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <UploadPanel storeSlug={slug} />
        <SamplesCard />
      </div>
      <ImportsTable storeSlug={slug} initialImports={imports} />
    </div>
  );
}
