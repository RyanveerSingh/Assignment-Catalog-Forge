import { DatabaseIcon, DownloadIcon, FileArchiveIcon, FileSpreadsheetIcon, type LucideIcon } from "lucide-react";

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
  { name: "empty.csv", what: "0 bytes. Refused before anything is uploaded." },
  { name: "fake.csv", what: "An HTML login page saved as .csv. Recognised by its bytes and rejected." },
  { name: "bulk-1000.csv", what: "1,000 rows, 477 products: 16% messy, 30 duplicates, SKU conflicts, scattered variants." },
  { name: "bulk-10000.csv", what: "10,000 rows, 2.75 MB: the row cap and the queue under load." },
];

const ICON_BY_EXT: Record<string, LucideIcon> = { csv: FileSpreadsheetIcon, xlsx: FileSpreadsheetIcon, zip: FileArchiveIcon, sql: DatabaseIcon };

function extensionOf(name: string): string {
  return name.toLowerCase().split(".").pop() ?? "";
}

/** The downloadable fixtures beside the drop zone, one row per file with its type and what it exercises. */
export function SamplesCard() {
  return (
    <aside aria-labelledby="samples-heading" className="self-start bg-card hairline">
      <div className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
        <h2 id="samples-heading" className="font-display text-lg text-ink">
          Sample files
        </h2>
        <span className="text-[11px] text-ink-muted">download, then drop</span>
      </div>
      <ul className="divide-y divide-border">
        {SAMPLES.map((s) => {
          const ext = extensionOf(s.name);
          const Icon = ICON_BY_EXT[ext] ?? FileSpreadsheetIcon;
          return (
            <li key={s.name}>
              <a
                href={`/api/samples/${s.name}`}
                download
                className="group flex cursor-pointer items-start gap-3 px-4 py-2 transition-colors hover:bg-paper-deep/40 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset focus-visible:outline-none"
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm bg-paper-deep text-ink-muted transition-colors group-hover:bg-brand-soft group-hover:text-brand">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="num truncate text-xs text-ink transition-colors group-hover:text-brand">{s.name}</span>
                    <span className="rounded-sm bg-paper-deep px-1 text-[9px] font-medium uppercase tracking-wider text-ink-muted">{ext}</span>
                  </span>
                  <span className="block text-xs text-ink-muted">{s.what}</span>
                </span>
                <DownloadIcon className="mt-1 size-3.5 shrink-0 -translate-x-1 text-brand opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100" aria-hidden />
              </a>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
