import Image from "next/image";
import { cn } from "cn";
import { CONTAINER } from "./site-chrome";

interface Step {
  title: string;
  text: string;
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Which part of the full screenshot the 16:10 window shows, as a translate of the 150 %-wide image. */
  focus: string;
}

/* Real screenshots from docs/screenshots, framed with CSS so the file stays untouched. */
const STEPS: readonly Step[] = [
  {
    title: "Upload any sheet and photos",
    text: "A CSV, Excel file, SQL dump or Google Sheets link, with photos or a ZIP of them. Mixed languages, European prices and odd units are expected.",
    src: "/landing/step-upload.png",
    alt: "The Upload page: a drop zone for a supplier sheet and photos, a Google Sheets link field, Fast and Economy modes and an AI budget, with sample files listed beside it.",
    width: 1440,
    height: 1940,
    focus: "translate(0, -4.5%)",
  },
  {
    title: "We clean, write and translate",
    text: "Prices, SKUs, weights and sizes are fixed by code, never by a model. Then the AI writes each listing from your rows and translates it, while you watch every row move.",
    src: "/landing/step-pipeline.png",
    alt: "An import in progress: the pipeline from Queued to Done, counts for total, done, needs review and failed rows, and a breakdown of what cleaning repaired in the sheet.",
    width: 1440,
    height: 900,
    focus: "translate(0, -26.5%)",
  },
  {
    title: "Review and publish",
    text: "Each listing sits beside the rows it came from. Hover a claim to see its cell, edit what you like, approve, and it is live on your storefront.",
    src: "/landing/step-review.png",
    alt: "The review drawer: the supplier's raw row on the left, the written listing with confidence scores on the right, and Approve, Send back and Reject buttons.",
    width: 1440,
    height: 900,
    focus: "translate(-23.6%, 0)",
  },
];

export function LandingSteps() {
  return (
    <section aria-labelledby="steps-heading" className="border-b border-border">
      <div className={cn(CONTAINER, "py-12 md:py-16")}>
        <h2 id="steps-heading" className="mb-8 text-[11px] font-medium uppercase tracking-[0.18em] text-brand">
          How it works
        </h2>
        <ol className="grid gap-10 md:grid-cols-3 md:gap-6">
          {STEPS.map((step, i) => (
            <li key={step.src} className="flex flex-col">
              <figure className="flex flex-col">
                <div className="relative aspect-[16/10] overflow-hidden bg-paper-deep hairline">
                  {/* On a phone the first screenshot is the largest paint above the fold, so it loads eagerly; the rest wait. */}
                  <Image src={step.src} alt={step.alt} width={step.width} height={step.height} priority={i === 0} loading={i === 0 ? undefined : "lazy"} className="absolute top-0 left-0 h-auto w-[150%] max-w-none" style={{ transform: step.focus }} />
                </div>
                <figcaption className="mt-4">
                  <span className="num text-[11px] text-brand">0{i + 1}</span>
                  <h3 className="font-display mt-1 text-xl text-ink">{step.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{step.text}</p>
                </figcaption>
              </figure>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
