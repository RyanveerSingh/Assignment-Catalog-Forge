import {
  type Dimensions,
  type Issue,
  type ParsedDimensions,
  type ParsedLength,
  type ParsedWeight,
  issue,
} from "../types";

type LengthUnit = "cm" | "mm" | "m" | "in" | "ft";
type DimKey = keyof Dimensions;

const CM_PER_UNIT: Readonly<Record<LengthUnit, number>> = { cm: 1, mm: 0.1, m: 100, in: 2.54, ft: 30.48 };
const GRAMS_PER_UNIT: Readonly<Record<"g" | "kg" | "lb" | "oz", number>> = {
  g: 1,
  kg: 1000,
  lb: 453.592,
  oz: 28.3495,
};

/** Plausibility bounds (EC-B8): a planter is never 0 cm or 12 m, nor 0 g or 600 kg. */
const MIN_CM = 0.1;
const MAX_CM = 1000;
const MIN_GRAMS = 1;
const MAX_GRAMS = 500_000;

const LENGTH_UNIT_ALIASES: Readonly<Record<string, LengthUnit>> = {
  cm: "cm",
  mm: "mm",
  m: "m",
  in: "in",
  inch: "in",
  inches: "in",
  '"': "in",
  "”": "in",
  "″": "in",
  ft: "ft",
  feet: "ft",
  foot: "ft",
  "'": "ft",
  "’": "ft",
  "′": "ft",
};

const LABEL_KEYS: Readonly<Record<string, DimKey>> = {
  "ø": "diameterCm",
  "⌀": "diameterCm",
  dia: "diameterCm",
  diam: "diameterCm",
  diameter: "diameterCm",
  durchmesser: "diameterCm",
  "diamètre": "diameterCm",
  diametre: "diameterCm",
  h: "heightCm",
  height: "heightCm",
  "höhe": "heightCm",
  hoehe: "heightCm",
  hauteur: "heightCm",
  w: "widthCm",
  b: "widthCm",
  width: "widthCm",
  breite: "widthCm",
  largeur: "widthCm",
  l: "lengthCm",
  length: "lengthCm",
  "länge": "lengthCm",
  laenge: "lengthCm",
  longueur: "lengthCm",
  t: "lengthCm",
  tiefe: "lengthCm",
  depth: "lengthCm",
  profondeur: "lengthCm",
};

// Written as code points so the invisible characters stay visible to reviewers.
const ZERO_WIDTH_RE = new RegExp(`[${String.fromCodePoint(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff)}]`, "g");
const ODD_SPACE_RE = new RegExp(`[${String.fromCodePoint(0xa0, 0x2007, 0x2009, 0x200a, 0x202f)}]`, "g");
const NEGATIVE_RE = /^[-−–]\s*\d/u;

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;
const LENGTH_UNIT = String.raw`(cm|mm|m|inches|inch|in|feet|foot|ft|"|”|″|'|’|′)`;
const WEIGHT_UNIT = String.raw`(kilograms?|kilos?|kgs?|gramm|grams?|gr|g|pounds?|lbs?|ounces?|oz)`;
// Long words first so "h" never wins over "höhe". "d" is resolved later (depth or diameter).
const LABEL =
  "ø|⌀|durchmesser|diam[èe]tre|diameter|diam|dia|höhe|hoehe|height|hauteur|breite|width|largeur|länge|laenge|length|longueur|tiefe|depth|profondeur|[hwldtb]";
// A letter other than the separator "x" must not touch a label or unit ("inkl", "min").
const NOT_LETTER_BEHIND = "(?<![a-wyzà-öø-ÿ])";
const NOT_LETTER_AHEAD = "(?![a-wyz])";

const LENGTH_RE = new RegExp(`${NUMBER}(?:\\s*${LENGTH_UNIT}${NOT_LETTER_AHEAD})?`, "iu");
const WEIGHT_RE = new RegExp(`${NUMBER}(?:\\s*${WEIGHT_UNIT}(?![a-z]))?`, "giu");
// [pre-label] number [unit] [post-label]; a post-label is never one that introduces the next number.
const SEGMENT_RE = new RegExp(
  `(?:${NOT_LETTER_BEHIND}(${LABEL})(?!\\p{L})\\s*[:=.]?\\s*)?` +
    `${NUMBER}(?:\\s*${LENGTH_UNIT}${NOT_LETTER_AHEAD})?` +
    `(?:\\s*${NOT_LETTER_BEHIND}(${LABEL})(?!\\p{L})(?!\\s*[:=.]?\\s*\\d))?`,
  "giu",
);
const DIM_SEPARATOR_RE = /^\s*(?:x|×|✕|\*|by|\/)\s*$/iu;

function clean(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  return raw
    .normalize("NFC")
    .replace(ZERO_WIDTH_RE, "")
    .replace(ODD_SPACE_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function toNumber(text: string): number {
  return Number(text.replace(",", "."));
}

/** One decimal, half-up; the epsilon tips binary near-halves like 1.15 the right way. */
function round1(value: number): number {
  return Math.round(value * 10 + 1e-9) / 10;
}

function toCm(value: number, unit: LengthUnit): number {
  return round1(value * CM_PER_UNIT[unit]);
}

function implausibleLength(cm: number, value: string): Issue | null {
  if (cm >= MIN_CM && cm <= MAX_CM) return null;
  return issue("length.implausible", "warn", `${formatCm(cm)} is outside the plausible range (0.1–1000 cm).`, {
    value,
    ec: "B8",
  });
}

export function formatCm(cm: number): string {
  return `${round1(cm)} cm`;
}

/** "20cm", '7.9"', "200 mm", "0.2 m", "20,5 cm" → cm to one decimal (EC-B7). */
export function parseLength(
  raw: string | null | undefined,
  opts?: { assumeUnit?: "cm" | "mm" | "in" },
): ParsedLength | null {
  const original = (raw ?? "").trim();
  const text = clean(raw);
  if (!/\d/.test(text) || NEGATIVE_RE.test(text)) return null;
  const match = LENGTH_RE.exec(text);
  if (!match) return null;

  const issues: Issue[] = [];
  const unit: LengthUnit | null = match[2] ? (LENGTH_UNIT_ALIASES[match[2]] ?? null) : null;
  const assumed = unit === null;
  const effective: LengthUnit = unit ?? opts?.assumeUnit ?? "cm";
  if (assumed) {
    issues.push(issue("unit.assumed", "info", `No unit given; assumed ${effective}.`, { value: original, ec: "B7" }));
  }
  const cm = toCm(toNumber(match[1]), effective);
  const implausible = implausibleLength(cm, original);
  if (implausible) issues.push(implausible);
  return { cm, assumed, issues };
}

function gramsPerWeightUnit(unit: string): number {
  if (unit.startsWith("kilo") || unit.startsWith("kg")) return GRAMS_PER_UNIT.kg;
  if (unit.startsWith("g")) return GRAMS_PER_UNIT.g;
  if (unit.startsWith("lb") || unit.startsWith("pound")) return GRAMS_PER_UNIT.lb;
  return GRAMS_PER_UNIT.oz;
}

/** "1.8 kg", "1800 g", "4 lbs", "2 lb 3 oz", "1 kg 200 g" → integer grams (EC-B7). */
export function parseWeight(raw: string | null | undefined): ParsedWeight | null {
  const original = (raw ?? "").trim();
  const text = clean(raw);
  if (!/\d/.test(text) || NEGATIVE_RE.test(text)) return null;

  const matches: RegExpExecArray[] = [];
  WEIGHT_RE.lastIndex = 0;
  for (let m = WEIGHT_RE.exec(text); m !== null; m = WEIGHT_RE.exec(text)) matches.push(m);
  if (matches.length === 0) return null;

  const issues: Issue[] = [];
  const withUnit = matches.filter((m) => m[2]);
  let grams: number;
  let assumed = false;

  if (withUnit.length > 0) {
    grams = withUnit.reduce((sum, m) => sum + toNumber(m[1]) * gramsPerWeightUnit(m[2]), 0);
  } else {
    // A bare "1.8" is a kilogram figure; a bare "1800" is grams. Nobody writes 1.8 g for a planter.
    const numberText = matches[0][1];
    const value = toNumber(numberText);
    const kilograms = /[.,]/.test(numberText) && value < 100;
    grams = kilograms ? value * 1000 : value;
    assumed = true;
    issues.push(
      issue("unit.assumed", "info", kilograms ? "No unit given; assumed kilograms." : "No unit given; assumed grams.", {
        value: original,
        ec: "B7",
      }),
    );
  }

  grams = Math.round(grams + 1e-9);
  if (grams < MIN_GRAMS || grams > MAX_GRAMS) {
    issues.push(
      issue("weight.implausible", "warn", `${grams} g is outside the plausible range (1 g–500 kg).`, {
        value: original,
        ec: "B8",
      }),
    );
  }
  return { grams, assumed, issues };
}

interface Segment {
  start: number;
  end: number;
  value: number;
  unit: LengthUnit | null;
  label: string | null;
  preLabeled: boolean;
}

function readSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  SEGMENT_RE.lastIndex = 0;
  for (let m = SEGMENT_RE.exec(text); m !== null; m = SEGMENT_RE.exec(text)) {
    const label = m[1] ?? m[4] ?? null;
    segments.push({
      start: m.index,
      end: m.index + m[0].length,
      value: toNumber(m[2]),
      unit: m[3] ? (LENGTH_UNIT_ALIASES[m[3]] ?? null) : null,
      label,
      preLabeled: Boolean(m[1]),
    });
  }
  return segments;
}

/**
 * Splits segments into runs that belong together. Unlabelled numbers must be joined by a
 * dimension separator (x, ×, *, by, /); labelled ones may be joined by anything without
 * letters, or by anything at all when the next number carries its own label. This keeps
 * "Set of 3 - 20 x 15 cm" from reading the 3 as a length.
 */
function splitRuns(text: string, segments: Segment[]): Segment[][] {
  const runs: Segment[][] = [];
  let run: Segment[] = [];
  for (const seg of segments) {
    const prev = run[run.length - 1];
    if (prev) {
      const gap = text.slice(prev.end, seg.start);
      const joined =
        DIM_SEPARATOR_RE.test(gap) || (prev.label !== null && (!/\p{L}/u.test(gap) || seg.preLabeled));
      if (!joined) {
        runs.push(run);
        run = [];
      }
    }
    run.push(seg);
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

/** "d" is depth in "W × D × H" but diameter in "H × D" or on its own. */
function keyForLabel(label: string | null, siblings: ReadonlySet<DimKey>): DimKey | null {
  if (label === null) return null;
  if (label === "d") return siblings.has("widthCm") || siblings.has("lengthCm") ? "lengthCm" : "diameterCm";
  return LABEL_KEYS[label] ?? null;
}

/**
 * "H20 x W15 cm", "20x15x10", "Ø 20 cm", "L: 20cm W: 15cm H: 10cm" → Dimensions in cm (EC-B7).
 * Unlabelled numbers are taken as length × width × height and flagged.
 */
export function parseDimensions(raw: string | null | undefined): ParsedDimensions | null {
  const original = (raw ?? "").trim();
  const text = clean(raw);
  if (!/\d/.test(text)) return null;

  const segments = readSegments(text);
  if (segments.length === 0) return null;
  const runs = splitRuns(text, segments);
  const best = runs.reduce((a, b) => (b.length > a.length ? b : a));
  if (best.length > 3) return null;
  if (best.length === 1 && best[0].label === null) return null;

  // A unit written once at the end applies to every number before it.
  const fallbackUnit = [...best].reverse().find((s) => s.unit !== null)?.unit ?? null;
  const unitAssumed = fallbackUnit === null;

  const labelledKeys = new Set<DimKey>();
  for (const seg of best) {
    if (seg.label !== null && seg.label !== "d") {
      const key = LABEL_KEYS[seg.label];
      if (key) labelledKeys.add(key);
    }
  }

  const dims: Dimensions = {};
  const issues: Issue[] = [];
  let orderAssumed = false;
  const order: DimKey[] = ["lengthCm", "widthCm", "heightCm"];
  const cmOf = (seg: Segment): number => toCm(seg.value, seg.unit ?? fallbackUnit ?? "cm");

  for (const seg of best) {
    const key = keyForLabel(seg.label, labelledKeys);
    if (key !== null && dims[key] === undefined) dims[key] = cmOf(seg);
  }
  for (const seg of best) {
    if (seg.label !== null) continue;
    const key = order.find((k) => dims[k] === undefined);
    if (!key) continue;
    dims[key] = cmOf(seg);
    orderAssumed = true;
  }

  if (unitAssumed) {
    issues.push(issue("unit.assumed", "info", "No unit given; assumed cm.", { value: original, ec: "B7" }));
  }
  if (orderAssumed) {
    issues.push(
      issue("dimensions.order_assumed", "info", "No labels; assumed length × width × height order.", {
        value: original,
      }),
    );
  }
  for (const key of Object.keys(dims) as DimKey[]) {
    const cm = dims[key];
    if (cm === undefined) continue;
    const implausible = implausibleLength(cm, original);
    if (implausible) issues.push(implausible);
  }

  return { dims, assumed: unitAssumed || orderAssumed, issues };
}
