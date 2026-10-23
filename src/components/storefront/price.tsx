import { cn } from "cn";
import { formatMoney } from "@/core/i18n/locale";
import type { PublishedVariant } from "@/db/schema";
import { t } from "./i18n";

export type PriceSummary =
  | { kind: "none" }
  | { kind: "single"; cents: number; currency: string }
  | { kind: "from"; cents: number; currency: string }
  | { kind: "mixed"; cents: number; currency: string; currencies: string[] };

/**
 * "from X" only when every priced variant shares one currency (EC-H9); otherwise the first
 * variant's price with a "per variant" hint, because a cross-currency minimum would be a lie.
 */
export function summarizePrice(variants: PublishedVariant[], priceFromCents: number | null, currency: string | null): PriceSummary {
  const priced = variants.filter((v): v is PublishedVariant & { priceCents: number; currency: string } => v.priceCents !== null && v.currency !== null);
  if (priced.length === 0) {
    return priceFromCents !== null && currency ? { kind: "single", cents: priceFromCents, currency } : { kind: "none" };
  }
  const currencies = [...new Set(priced.map((v) => v.currency))];
  if (currencies.length > 1) {
    const first = priced[0]!;
    return { kind: "mixed", cents: first.priceCents, currency: first.currency, currencies };
  }
  const cur = currencies[0]!;
  const min = priced.reduce((m, v) => Math.min(m, v.priceCents), priced[0]!.priceCents);
  const distinct = new Set(priced.map((v) => v.priceCents)).size > 1;
  return distinct ? { kind: "from", cents: min, currency: cur } : { kind: "single", cents: min, currency: cur };
}

export function Price({ summary, locale, className }: { summary: PriceSummary; locale: string; className?: string }) {
  if (summary.kind === "none") return <span className={cn("text-ink-muted", className)}>{t(locale, "priceOnRequest")}</span>;
  const amount = <span className="num">{formatMoney(summary.cents, summary.currency, locale)}</span>;
  if (summary.kind === "single") return <span className={className}>{amount}</span>;
  if (summary.kind === "from")
    return (
      <span className={className}>
        <span className="text-ink-muted">{t(locale, "from")} </span>
        {amount}
      </span>
    );
  return (
    <span className={className}>
      {amount}
      <span className="text-ink-muted"> · {t(locale, "perVariant")}</span>
    </span>
  );
}
