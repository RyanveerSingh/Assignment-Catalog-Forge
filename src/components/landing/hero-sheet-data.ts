/*
 * Real rows of samples/new-12.csv, as the supplier sent them, and what the deterministic cleaner
 * makes of each broken cell (EDGE-CASES A4, B5, B7, B13, C4, C6). Nothing here is invented: the raw
 * values are copied from the file and the fixed values are what the cleaner's tests assert.
 */

export type Column = "sku" | "title" | "price" | "weight" | "size" | "text";

export interface Cell {
  raw: string;
  /** What the cleaner turns the cell into; absent when the cell is already clean. */
  fixed?: string;
  /** A repair goes through; a review hold stays orange so a person decides. */
  kind?: "fix" | "review";
}

export interface SheetRow {
  line: number;
  /** The rows that become the hero listing. */
  vase?: boolean;
  cells: Record<Column, Cell>;
}

export const COLUMNS: ReadonlyArray<{ key: Column; label: string; className: string }> = [
  { key: "sku", label: "SKU", className: "w-[13%] max-md:hidden" },
  { key: "title", label: "Title", className: "w-[22%] max-md:w-[42%]" },
  { key: "price", label: "Price", className: "w-[15%] max-md:w-[30%]" },
  { key: "weight", label: "Weight", className: "w-[12%] max-md:w-[28%]" },
  { key: "size", label: "Size", className: "w-[19%] max-lg:hidden" },
  { key: "text", label: "Description", className: "w-[19%] max-xl:hidden" },
];

const c = (raw: string, fixed?: string, kind: Cell["kind"] = "fix"): Cell => (fixed === undefined ? { raw } : { raw, fixed, kind });

export const ROWS: readonly SheetRow[] = [
  {
    line: 8,
    cells: { sku: c("WX-DC-L"), title: c("Waxed Cotton Dog Coat"), price: c("49.30"), weight: c("406 g"), size: c("17.8 in x 13.4 in x 0.9 in", "45.2 × 34.0 × 2.3 cm"), text: c("Dog coat in British waxed…") },
  },
  {
    line: 10,
    vase: true,
    cells: { sku: c("ST-VS-SG"), title: c("Steinzeug-Vase"), price: c("24,00", "€24.00"), weight: c("650 g"), size: c("Ø 10 cm, H 22 cm"), text: c("Flaschenförmige Vase aus…") },
  },
  {
    line: 11,
    vase: true,
    cells: { sku: c("ST-VS-OC"), title: c("Steinzeug-Vase"), price: c("EUR 24", "€24.00"), weight: c("650 g"), size: c("Ø 10 cm, H 22 cm"), text: c("Flaschenförmige Vase aus…") },
  },
  {
    line: 16,
    cells: { sku: c("BW-FW-01"), title: c("Beeswax Food Wraps"), price: c("£8", "£8.00"), weight: c("60 g"), size: c("33 x 33 x 0.5 cm"), text: c("Set of three reusable…") },
  },
  {
    line: 17,
    cells: { sku: c("OK-WC-01"), title: c("Oak Wall Clock"), price: c("69.00"), weight: c("900 g"), size: c("Ø 30 cm, H 4 cm"), text: c("<p>30 cm wall clock…", "30 cm wall clock…") },
  },
  {
    line: 18,
    cells: { sku: c("EN-SP-20"), title: c("Enamel Stock Pot"), price: c("59.00"), weight: c("4 lbs", "1,814 g"), size: c("Ø 20 cm, H 16 cm"), text: c("Stock pot in enamelled…") },
  },
  {
    line: 20,
    cells: { sku: c("TK-GB-01"), title: c("Teak Garden Bench"), price: c("1.299,00 €", "€1,299.00"), weight: c("24 kg", "24,000 g"), size: c("150 x 60 x 90 cm"), text: c("Three-seater garden…") },
  },
  {
    line: 22,
    cells: { sku: c("SG-BK-M"), title: c("Seegras-Korb mit Griffen"), price: c("26,60", "€26.60"), weight: c("630 g"), size: c("Ø 33.6 cm, H 24.6 cm"), text: c("…aus natÃ¼rlichem Seegras", "…aus natürlichem Seegras") },
  },
  {
    line: 23,
    cells: { sku: c("EN-SP-24"), title: c("Enamel Stock Pot"), price: c("87.62", "≠ 79.65 on row 19", "review"), weight: c("2449 g"), size: c("Ø 24 cm, H 19.2 cm"), text: c("Stock pot in enamelled…") },
  },
  {
    line: 26,
    cells: { sku: c("LN-AP-01"), title: c("Linen Apron"), price: c("n/a", "missing", "review"), weight: c("300 g"), size: c("85 x 70 x 1 cm"), text: c("Linen apron…") },
  },
  {
    line: 27,
    cells: { sku: c("", "GEN-…", "review"), title: c("Walnut Pen Holder"), price: c("28.50"), weight: c("220 g"), size: c("Ø 8 cm, H 10 cm"), text: c("Pen holder turned from…") },
  },
];

/** The broken cells in reading order, which is the order the animation repairs them. */
export const REPAIRS: ReadonlyArray<{ row: number; col: Column }> = ROWS.flatMap((r, row) =>
  COLUMNS.filter((col) => r.cells[col.key].fixed !== undefined).map((col) => ({ row, col: col.key })),
);

/** The listing the demo store published from the vase rows, in its three languages. */
export const LISTING = [
  { lang: "EN", title: "Hand-Turned Stoneware Vase", detail: "4 colours · 22 cm tall" },
  { lang: "DE", title: "Handgedrehte Steinzeugvase", detail: "4 Farben · 22 cm hoch" },
  { lang: "FR", title: "Vase en grès tourné à la main", detail: "4 couleurs · 22 cm de haut" },
] as const;

export const CLAIMS = [
  { text: "Hand-turned stoneware", source: "Description · “handgedreht”" },
  { text: "Glazed inside, watertight", source: "Description · “innen glasiert und daher wasserdicht”" },
  { text: "Each one glazed by hand", source: "Notes · “von Hand glasiert”" },
] as const;
