import { DownloadIcon } from "lucide-react";

/** Served by /api/samples/[name]. Three starting points: the smoke test, every mess at once, and twelve new products with real photos. */
const SAMPLES: ReadonlyArray<{ key: string; files: string[]; hint: string }> = [
  { key: "tiny", files: ["tiny-10.csv"], hint: "10 clean rows, 4 products. The smoke test." },
  { key: "messy", files: ["messy-120.csv", "photos-messy.zip"], hint: "Every mess at once: mixed headers, EU prices, scattered variants, duplicates, 56 photos." },
  { key: "new", files: ["new-12.csv", "photos-new-12.zip"], hint: "12 products with German and French rows, odd prices and units, and 18 real photos." },
];

function SampleLink({ name }: { name: string }) {
  return (
    <a href={`/api/samples/${name}`} download className="num cursor-pointer rounded-full px-1 text-[12px] text-ink underline-offset-4 outline-none hover:text-brand hover:underline focus-visible:ring-2 focus-visible:ring-brand">
      {name}
    </a>
  );
}

/** "Or try a sample": three pills, each file inside a download link. Download, then drop. */
export function SamplePills({ disabled = false }: { disabled?: boolean }) {
  return (
    <div className={disabled ? "pointer-events-none opacity-60" : undefined}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[12px] text-ink-muted">or try a sample</span>
        <ul className="flex flex-wrap gap-2" aria-label="Sample files">
          {SAMPLES.map((s) => (
            <li key={s.key} title={s.hint} className="inline-flex h-9 items-center gap-1 rounded-full bg-card pr-3 pl-2.5 ring-1 ring-border transition-transform duration-150 hover:-translate-y-px hover:ring-brand/40">
              <DownloadIcon className="size-3.5 shrink-0 text-brand" aria-hidden />
              {s.files.map((f, i) => (
                <span key={f} className="inline-flex items-center">
                  {i > 0 ? <span className="px-0.5 text-ink-muted">+</span> : null}
                  <SampleLink name={f} />
                </span>
              ))}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
