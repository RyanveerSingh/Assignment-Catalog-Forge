/**
 * Deterministic corruption primitives for the sample generator.
 *
 * Each function turns a clean value into one specific real-world mess (EU price formats,
 * mojibake, unsafe HTML, …). They are pure: the caller decides which rows get which mess so
 * the ground truth can record it. EC IDs refer to EDGE-CASES.md.
 */

import * as iconv from "iconv-lite";

// ---------------------------------------------------------------------------
// Prices (EC-B2, EC-B5)
// ---------------------------------------------------------------------------

function splitCents(cents: number): { whole: number; minor: string } {
  const abs = Math.abs(cents);
  return { whole: Math.floor(abs / 100), minor: String(abs % 100).padStart(2, "0") };
}

function group(whole: number, sep: string): string {
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/** "12.50", "1299.00" — the clean form. */
export function priceClean(cents: number): string {
  const { whole, minor } = splitCents(cents);
  return `${whole}.${minor}`;
}

/** "1.299,00 €" */
export function priceEu(cents: number): string {
  const { whole, minor } = splitCents(cents);
  return `${group(whole, ".")},${minor} €`;
}

/** "12,50" */
export function priceEuPlain(cents: number): string {
  const { whole, minor } = splitCents(cents);
  return `${whole},${minor}`;
}

/** "€ 12,50" */
export function priceEuSymbolFirst(cents: number): string {
  return `€ ${priceEuPlain(cents)}`;
}

/** "1,299.00" */
export function priceUsThousands(cents: number): string {
  const { whole, minor } = splitCents(cents);
  return `${group(whole, ",")}.${minor}`;
}

/** "£8" when whole pounds, otherwise "£8.50". */
export function priceGbp(cents: number): string {
  const { whole, minor } = splitCents(cents);
  return minor === "00" ? `£${whole}` : `£${whole}.${minor}`;
}

/** "$ 12.99" */
export function priceUsd(cents: number): string {
  return `$ ${priceClean(cents)}`;
}

/** "EUR 12" when whole, otherwise "EUR 12.50". */
export function priceCodePrefix(cents: number, code: string): string {
  const { whole, minor } = splitCents(cents);
  return minor === "00" ? `${code} ${whole}` : `${code} ${whole}.${minor}`;
}

/** "12.5 GBP" — trailing zero dropped, code after the number. */
export function priceCodeSuffix(cents: number, code: string): string {
  const { whole, minor } = splitCents(cents);
  const dec = minor === "00" ? "" : `.${minor.replace(/0$/, "")}`;
  return `${whole}${dec} ${code}`;
}

/** "1.299" — a whole amount ≥ 1,000 written with a thousands dot and no decimals (ambiguous). */
export function priceAmbiguous(cents: number): string {
  if (cents % 100 !== 0 || cents < 100000) {
    throw new Error(`priceAmbiguous needs a whole amount >= 1000, got ${cents}`);
  }
  return group(cents / 100, ".");
}

/** Values that mean "no price" in the wild. */
// ---------------------------------------------------------------------------
// Units (EC-B7, EC-B13, EC-B18)
// ---------------------------------------------------------------------------

function trimZeros(n: string): string {
  return n.includes(".") ? n.replace(/\.?0+$/, "") : n;
}

export function weightClean(grams: number): string {
  return `${grams} g`;
}

/** "1.8 kg" */
export function weightKg(grams: number): string {
  return `${trimZeros((grams / 1000).toFixed(3))} kg`;
}

/** "1,8 kg" */
export function weightKgEu(grams: number): string {
  return weightKg(grams).replace(".", ",");
}

/** "1800g" */
export function weightNoSpace(grams: number): string {
  return `${grams}g`;
}

/** "1800" — no unit; the importer must assume grams and flag it. */
export function weightBare(grams: number): string {
  return String(grams);
}

export type Dims = [number, number, number];

const fmt1 = (n: number): string => trimZeros(n.toFixed(1));

/** "20 x 20 x 18 cm" */
export function dimsClean([l, w, h]: Dims): string {
  return `${fmt1(l)} x ${fmt1(w)} x ${fmt1(h)} cm`;
}

/** "Ø 20 cm, H 18 cm" for round items. */
export function dimsRound([d, , h]: Dims): string {
  return `Ø ${fmt1(d)} cm, H ${fmt1(h)} cm`;
}

/** "H18 x W20 x D20 cm" */
export function dimsLabelled([l, w, h]: Dims): string {
  return `H${fmt1(h)} x W${fmt1(w)} x D${fmt1(l)} cm`;
}

/** "7.9 in x 7.9 in x 7.1 in" */
export function dimsInches([l, w, h]: Dims): string {
  const inch = (n: number): string => (n / 2.54).toFixed(1);
  return `${inch(l)} in x ${inch(w)} in x ${inch(h)} in`;
}

/** "200 x 200 x 180 mm" */
export function dimsMm([l, w, h]: Dims): string {
  return `${Math.round(l * 10)} x ${Math.round(w * 10)} x ${Math.round(h * 10)} mm`;
}

/** "20x20x18" — no unit. */
export function dimsBare([l, w, h]: Dims): string {
  return `${fmt1(l)}x${fmt1(w)}x${fmt1(h)}`;
}

export type SizeSpelling = "nospace" | "prefixed" | "upper" | "compact";

/** "20 cm" → "20cm" | "Size 20" | "20 CM" | "20CM"; non-cm labels get only the prefix form. */
export function sizeSpelling(label: string, style: SizeSpelling): string {
  const m = /^(\d+(?:\.\d+)?)\s*cm$/.exec(label);
  if (!m) return style === "prefixed" ? `Size ${label}` : label;
  const n = m[1];
  switch (style) {
    case "nospace":
      return `${n}cm`;
    case "prefixed":
      return `Size ${n}`;
    case "upper":
      return `${n} CM`;
    case "compact":
      return `${n}CM`;
  }
}

/** Placeholder strings that must be treated as empty (EC-B13). */
export const PLACEHOLDERS = ["N/A", "n/a", "-", "null", "none", "TBD", "—"] as const;

/** Non-ISO spellings suppliers put in a currency column for euros (EC-B2). */
export const EUR_CURRENCY_SPELLINGS = ["€", "Euro", "eur", "EURO"] as const;

// ---------------------------------------------------------------------------
// Colours (EC-B9)
// ---------------------------------------------------------------------------

const COLOUR_TYPOS: Record<string, string> = {
  terracotta: "terracota",
  charcoal: "charcol",
  burgundy: "burgandy",
  grey: "gray",
  "forest green": "forrest green",
  "sage green": "sage gren",
  mustard: "mustad",
  "blush pink": "blush pnk",
  cream: "creme",
  navy: "navvy",
  ochre: "ocher",
  teal: "teel",
};

const COLOUR_DE: Record<string, string> = {
  terracotta: "terrakotta",
  white: "weiß",
  black: "schwarz",
  "sage green": "salbeigrün",
  "dark blue": "dunkelblau",
  grey: "grau",
  charcoal: "anthrazit",
  "blush pink": "altrosa",
  cream: "creme",
  natural: "natur",
  rust: "rostrot",
  mustard: "senfgelb",
  "forest green": "tannengrün",
  teal: "petrol",
  ochre: "ocker",
  burgundy: "bordeaux",
  red: "rot",
  navy: "marineblau",
  blue: "blau",
  "natural oak": "Eiche natur",
  "smoked oak": "Eiche geräuchert",
};

const COLOUR_FR: Record<string, string> = {
  terracotta: "terre cuite",
  white: "blanc",
  black: "noir",
  "sage green": "vert sauge",
  "dark blue": "bleu foncé",
  grey: "gris",
  charcoal: "anthracite",
  "blush pink": "rose poudré",
  cream: "crème",
  natural: "naturel",
  rust: "rouille",
  mustard: "moutarde",
  "forest green": "vert forêt",
  teal: "bleu canard",
  ochre: "ocre",
  burgundy: "bordeaux",
  red: "rouge",
  navy: "bleu marine",
  blue: "bleu",
  "natural oak": "chêne naturel",
  "smoked oak": "chêne fumé",
};

export function colourTypo(label: string): string {
  return COLOUR_TYPOS[label] ?? label;
}

export function colourDe(label: string): string {
  return COLOUR_DE[label] ?? label;
}

export function colourFr(label: string): string {
  return COLOUR_FR[label] ?? label;
}

/** "Terra Cotta" style: title-cased with the compound split. */
export function colourTitleCase(label: string): string {
  return label
    .replace("terracotta", "terra cotta")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Text corruption (EC-A4, EC-B11, EC-B12, EC-B13, EC-B14, EC-A15)
// ---------------------------------------------------------------------------

/** UTF-8 bytes read back as windows-1252: "Größe" → "GrÃ¶ÃŸe" (EC-A4). */
export function toMojibake(s: string): string {
  return iconv.decode(Buffer.from(s, "utf8"), "win1252");
}

/** Replaces the first space with a no-break space. */
export function withNbsp(s: string): string {
  return s.replace(" ", " ");
}

/** Inserts a zero-width space in the middle and a zero-width joiner at the end. */
export function withZeroWidth(s: string): string {
  const mid = Math.floor(s.length / 2);
  return `${s.slice(0, mid)}​${s.slice(mid)}‍`;
}

export function withSmartQuotes(s: string): string {
  return s.replace(/"([^"]+)"/g, "“$1”").replace(/'/g, "’");
}

export type SkuStyle = "lower" | "trailing-space" | "leading-space" | "lower-trailing" | "padded";

/** "TC-PL-20" → "tc-pl-20 " etc. The identity is unchanged after trim + uppercase (EC-B14). */
export function messySku(sku: string, style: SkuStyle): string {
  switch (style) {
    case "lower":
      return sku.toLowerCase();
    case "trailing-space":
      return `${sku} `;
    case "leading-space":
      return ` ${sku}`;
    case "lower-trailing":
      return `${sku.toLowerCase()} `;
    case "padded":
      return `  ${sku}  `;
  }
}

/** Description with an active-content payload the sanitiser must strip (EC-B11). */
export function htmlUnsafe(description: string): string {
  return (
    `<p>${description}</p>` +
    `<script>alert(1)</script>` +
    `<p onclick="alert(2)" style="color:red">Click here for the full spec sheet</p>` +
    `<a href="javascript:alert(3)">Download</a>` +
    `<img src="x" onerror="alert(4)">`
  );
}

/** Harmless formatting HTML that should survive the allowlist. */
export function htmlBenign(description: string, bullets: string[]): string {
  const [first, ...rest] = description.split(". ");
  const items = bullets.map((b) => `<li>${b}</li>`).join("");
  return `<p><strong>${first}.</strong> ${rest.join(". ")}</p><ul>${items}</ul>`;
}

/** Unclosed tags (EC-B12). */
export function htmlBroken(description: string): string {
  const [first, ...rest] = description.split(". ");
  return `<p><b>${first}.<p>${rest.join(". ")}<br><i>See notes`;
}

/** Description with a hard line break inside the cell (EC-A6). */
export function withLineBreak(description: string): string {
  const [first, ...rest] = description.split(". ");
  return `${first}.\n${rest.join(". ")}`;
}

/** Supplier boilerplate used to pad the very long description; cycled, never lorem ipsum. */
export const BOILERPLATE: string[] = [
  "Shipping: dispatched within 2 working days from our warehouse in Porto. Orders over 150 € ship free within the EU; other destinations are charged at cost and shown at checkout.",
  "Returns: unused items in their original packaging may be returned within 30 days. Made-to-order and personalised pieces are excluded. Contact the trade desk for a returns number before sending anything back.",
  "About the maker: our workshop has worked with the same family-run kilns and weaving sheds since 2009. We visit twice a year, agree prices for the season up front and never move production to chase a cheaper quote.",
  "Packaging: items are packed in recycled cardboard with paper void fill. We do not use plastic bubble wrap or polystyrene. Fragile goods are double-boxed.",
  "Care: most pieces only need a wipe with a damp cloth. Textiles should be washed according to the label. Wood benefits from a light oiling once or twice a year.",
  "Trade terms: minimum order 250 € net, payment 30 days end of month for approved accounts. Pro forma for first orders. Prices exclude VAT and are valid until the next price list.",
  "Variations: natural materials vary. Expect differences in grain, glaze pooling and weave from piece to piece; this is not a fault and is not grounds for return.",
];

/** Builds a description of exactly `target` characters from real copy (EC-A15). */
export function longDescription(lead: string, target = 25_000): string {
  const parts = [lead];
  let length = lead.length;
  let i = 0;
  while (length < target + 1) {
    const para = `\n\n${BOILERPLATE[i % BOILERPLATE.length]}`;
    parts.push(para);
    length += para.length;
    i++;
  }
  return parts.join("").slice(0, target);
}

/** Simple slug for Shopify-style handles and title-derived keys. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
