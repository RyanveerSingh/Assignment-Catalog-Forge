import {
  type Dimensions,
  type Issue,
  type ParsedDimensions,
  type ParsedLength,
  type ParsedWeight,
  issue,
} from "../types";

export type LengthUnit = "cm" | "mm" | "m" | "in" | "ft";
export type WeightUnit = "g" | "kg" | "lb" | "oz";
type DimKey = keyof Dimensions;

const CM_PER_UNIT: Readonly<Record<LengthUnit, number>> = { cm: 1, mm: 0.1, m: 100, in: 2.54, ft: 30.48 };
const GRAMS_PER_UNIT: Readonly<Record<WeightUnit, number>> = { g: 1, kg: 1000, lb: 453.592, oz: 28.3495 };

/**
 * Plausibility bounds (EC-B8). Outside them the value is kept but flagged: under 5 g or 0.5 cm,
 * or over 500 kg or 10 m, is far more often a unit mistake (kg read as g) than a real product.
 */
const MIN_CM = 0.5;
const MAX_CM = 1000;
const MIN_GRAMS = 5;
const MAX_GRAMS = 500_000;

const LENGTH_UNIT_ALIASES: Readonly<Record<string, LengthUnit>> = {
  cm: "cm", zentimeter: "cm", centimeter: "cm", centimeters: "cm", centimetre: "cm", centimetres: "cm", "centimètre": "cm", "centimètres": "cm",
  mm: "mm", millimeter: "mm", millimeters: "mm", millimetre: "mm", millimetres: "mm", "millimètre": "mm", "millimètres": "mm",
  m: "m", meter: "m", meters: "m", metre: "m", metres: "m", "mètre": "m", "mètres": "m",
  in: "in", inch: "in", inches: "in", zoll: "in", pouce: "in", pouces: "in", '"': "in", "”": "in", "″": "in",
  ft: "ft", feet: "ft", foot: "ft", "fuß": "ft", fuss: "ft", pied: "ft", pieds: "ft", "'": "ft", "’": "ft", "′": "ft",
};

const WEIGHT_UNIT_ALIASES: Readonly<Record<string, WeightUnit>> = {
  g: "g", gr: "g", gram: "g", grams: "g", gramm: "g", gramme: "g", grammes: "g",
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg", kilogramm: "kg", kilogramme: "kg", kilogrammes: "kg",
  lb: "lb", lbs: "lb", pound: "lb", pounds: "lb", pfund: "lb", livre: "lb", livres: "lb",
  oz: "oz", ounce: "oz", ounces: "oz", unze: "oz", unzen: "oz", once: "oz", onces: "oz",
};

// "hoch", "breit", "high", "wide"… only ever follow a number ("30 cm hoch, 25 cm breit").
const LABEL_GROUPS: ReadonlyArray<readonly [DimKey, string]> = [
  ["diameterCm", "ø ⌀ dia diam diameter durchmesser diamètre diametre"],
  ["heightCm", "h height höhe hoehe hauteur hoch high haut"],
  ["widthCm", "w b width breite largeur breit wide large"],
  ["lengthCm", "l length länge laenge longueur t tiefe depth profondeur tief deep profond lang long"],
];
const LABEL_KEYS: Readonly<Record<string, DimKey>> = Object.fromEntries(
  LABEL_GROUPS.flatMap(([key, words]) => words.split(" ").map((w) => [w, key] as const)),
);

// Written as code points so the invisible characters stay visible to reviewers.
const ZERO_WIDTH_RE = new RegExp(`[${String.fromCodePoint(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff)}]`, "g");
const ODD_SPACE_RE = new RegExp(`[${String.fromCodePoint(0xa0, 0x2007, 0x2009, 0x200a, 0x202f)}]`, "g");
const NEGATIVE_RE = /^[-−–]\s*\d/u;

// Several separators are allowed so "1.200,5" and "1,200" reach the number reader whole.
const NUMBER = String.raw`(\d+(?:[.,]\d+)*)`;
const LENGTH_UNIT = String.raw`(zentimeter|centim[eè]t(?:er|re)s?|millim[eè]t(?:er|re)s?|m[eè]t(?:er|re)s?|cm|mm|m|inches|inch|in|zoll|pouces?|feet|foot|ft|fu(?:ß|ss)|pieds?|"|”|″|'|’|′)`;
const WEIGHT_UNIT = String.raw`(kilogramm(?:es?)?|kilograms?|kilos?|kgs?|gramm(?:es?)?|grams?|gr|g|pounds?|pfund|livres?|lbs?|ounces?|unzen?|onces?|oz)`;
// Long words first so "h" never wins over "höhe". "d" is resolved later (depth or diameter).
const LABEL =
  "ø|⌀|durchmesser|diam[èe]tre|diameter|diam|dia|höhe|hoehe|height|hauteur|breite|width|largeur|länge|laenge|length|longueur|tiefe|depth|profondeur|" +
  "hoch|breit|tief|lang|high|wide|deep|long|haut|large|profond|[hwldtb]";
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

function count(text: string, char: string): number {
  return text.split(char).length - 1;
}

/**
 * Both separators: the last one is the decimal. A repeated one groups thousands. A lone one before
 * exactly three digits is a thousands group only for small units ("1,200 g", "1.500 mm"): nobody
 * writes 1.2 g, while "1,200 kg" is German for 1.2 kg.
 */
function toNumber(text: string, smallUnit = false): number {
  const dots = count(text, ".");
  const commas = count(text, ",");
  if (dots > 0 && commas > 0) {
    const decimal = text.lastIndexOf(".") > text.lastIndexOf(",") ? "." : ",";
    return Number(text.split(decimal === "." ? "," : ".").join("").replace(",", "."));
  }
  if (dots + commas === 0) return Number(text);
  const parts = text.split(dots > 0 ? "." : ",");
  if (parts.length > 2) return Number(parts.join(""));
  if (smallUnit && parts[1].length === 3 && /^[1-9]\d{0,2}$/.test(parts[0])) return Number(parts.join(""));
  return Number(parts.join("."));
}

/** One decimal, half-up; the epsilon tips binary near-halves like 1.15 the right way. */
function round1(value: number): number {
  return Math.round(value * 10 + 1e-9) / 10;
}

function toCm(value: number, unit: LengthUnit): number {
  return round1(value * CM_PER_UNIT[unit]);
}

function foldUnit(token: string): string {
  return token.toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "").replace(/ß/g, "ss");
}

function lengthUnitOf(token: string | undefined): LengthUnit | null {
  if (!token) return null;
  return LENGTH_UNIT_ALIASES[token.toLowerCase()] ?? LENGTH_UNIT_ALIASES[foldUnit(token)] ?? null;
}

function weightUnitOf(token: string | undefined): WeightUnit | null {
  return token ? (WEIGHT_UNIT_ALIASES[foldUnit(token)] ?? null) : null;
}

function implausibleLength(cm: number, value: string): Issue | null {
  if (cm >= MIN_CM && cm <= MAX_CM) return null;
  return issue("length.implausible", "warn", `${formatCm(cm)} is outside the plausible range (0.5–1000 cm); check the unit.`, {
    value,
    ec: "B8",
  });
}

export function formatCm(cm: number): string {
  return `${round1(cm)} cm`;
}

export interface UnitOptions<U> {
  /** Unit to use when the value has none; reported as an assumption. */
  assumeUnit?: U;
  /** Unit stated in the column header ("Weight (kg)"); used when the value has none. */
  headerUnit?: U | null;
}

function missingUnitIssue(unit: string, fromHeader: boolean, value: string): Issue {
  return fromHeader
    ? issue("unit.from_header", "info", `No unit in the value; used ${unit} from the column header.`, { value, ec: "B7" })
    : issue("unit.assumed", "info", `No unit given; assumed ${unit}.`, { value, ec: "B7" });
}

/** "20cm", '7.9"', "200 mm", "0.2 m", "20,5 cm", "12 Zoll" → cm to one decimal (EC-B7). */
export function parseLength(raw: string | null | undefined, opts?: UnitOptions<LengthUnit>): ParsedLength | null {
  const original = (raw ?? "").trim();
  const text = clean(raw);
  if (!/\d/.test(text) || NEGATIVE_RE.test(text)) return null;
  const match = LENGTH_RE.exec(text);
  if (!match) return null;

  const issues: Issue[] = [];
  const unit = lengthUnitOf(match[2]);
  const header = opts?.headerUnit ?? null;
  const effective: LengthUnit = unit ?? header ?? opts?.assumeUnit ?? "cm";
  const assumed = unit === null && header === null;
  if (unit === null) issues.push(missingUnitIssue(effective, header !== null, original));
  const cm = toCm(toNumber(match[1], effective === "mm"), effective);
  const implausible = implausibleLength(cm, original);
  if (implausible) issues.push(implausible);
  return { cm, assumed, issues };
}

interface WeightToken {
  start: number;
  end: number;
  text: string;
  unit: WeightUnit | null;
}

interface WeightGroup {
  start: number;
  end: number;
  grams: number;
}

const RANGE_GAP_RE = /^\s*(?:[-–—~]|to|bis|à)\s*$/u;
const COMPOUND_GAP_RE = /^\s*(?:\+|and|und|et)?\s*$/u;
const NET_RE = /(?<!\p{L})(?:net|netto|nett|neto)(?!\p{L})/u;

function weightTokens(text: string): WeightToken[] {
  const tokens: WeightToken[] = [];
  WEIGHT_RE.lastIndex = 0;
  for (let m = WEIGHT_RE.exec(text); m !== null; m = WEIGHT_RE.exec(text)) {
    tokens.push({ start: m.index, end: m.index + m[0].length, text: m[1], unit: weightUnitOf(m[2]) });
  }
  return tokens;
}

function gramsOf(t: WeightToken, unit: WeightUnit): number {
  return toNumber(t.text, unit === "g") * GRAMS_PER_UNIT[unit];
}

/** "2 lb 3 oz" and "1 kg 200 g" are one weight; "1.5 kg (net), 2 kg (gross)" are two. */
function groupWeights(text: string, tokens: WeightToken[]): WeightGroup[] {
  const groups: WeightGroup[] = [];
  let prevUnit: WeightUnit | null = null;
  for (const t of tokens) {
    if (t.unit === null) continue;
    const last = groups[groups.length - 1];
    const compound =
      last !== undefined &&
      prevUnit !== null &&
      GRAMS_PER_UNIT[prevUnit] > GRAMS_PER_UNIT[t.unit] &&
      COMPOUND_GAP_RE.test(text.slice(last.end, t.start));
    if (compound) {
      last.grams += gramsOf(t, t.unit);
      last.end = t.end;
    } else groups.push({ start: t.start, end: t.end, grams: gramsOf(t, t.unit) });
    prevUnit = t.unit;
  }
  return groups;
}

/** The net weight when one is labelled ("Netto 1,5 kg" or "1.5 kg (net)"), otherwise the first. */
function pickNet(text: string, groups: WeightGroup[]): { group: WeightGroup; net: boolean } {
  const m = NET_RE.exec(text);
  if (!m) return { group: groups[0], net: false };
  // The label belongs to the nearest weight, before ("net: 1.5 kg") or after ("1.5 kg (net), 2 kg").
  const start = m.index;
  const end = m.index + m[0].length;
  const distance = (g: WeightGroup): number => (start >= g.end ? start - g.end : g.start >= end ? g.start - end : 0);
  const group = groups.reduce((best, g) => (distance(g) < distance(best) ? g : best));
  return { group, net: true };
}

/**
 * "1.8 kg", "1800 g", "4 lbs", "2 lb 3 oz", "1 kg 200 g", "1 Pfund" → integer grams (EC-B7).
 * A range ("2-3 kg") gives no weight: either bound would be a guess presented as a fact, so the
 * row goes to review with a `weight.range` warning instead. Several weights ("1.5 kg net, 2 kg
 * gross") are never summed: the net one (or the first) is used and flagged.
 */
export function readWeight(raw: string | null | undefined, opts?: UnitOptions<WeightUnit>): { weight: ParsedWeight | null; issues: Issue[] } {
  const original = (raw ?? "").trim();
  const text = clean(raw);
  if (!/\d/.test(text) || NEGATIVE_RE.test(text)) return { weight: null, issues: [] };
  const tokens = weightTokens(text);
  if (tokens.length === 0) return { weight: null, issues: [] };

  for (let i = 1; i < tokens.length; i++) {
    if (RANGE_GAP_RE.test(text.slice(tokens[i - 1].end, tokens[i].start))) {
      const why = issue("weight.range", "warn", "Weight is a range; one weight is needed, so none was taken.", { value: original, ec: "B7" });
      return { weight: null, issues: [why] };
    }
  }

  const issues: Issue[] = [];
  const groups = groupWeights(text, tokens);
  let grams: number;
  let assumed = false;
  const header = opts?.headerUnit ?? null;

  if (groups.length > 0) {
    const { group, net } = pickNet(text, groups);
    grams = group.grams;
    if (groups.length > 1) {
      const used = net ? "the net weight" : "the first";
      issues.push(issue("weight.multiple", "warn", `Several weights found; used ${used}.`, { value: original, ec: "B7" }));
    }
  } else if (lengthUnitOf(/^\s*([\p{L}"″”']+)/u.exec(text.slice(tokens[0].end))?.[1])) {
    // "12 Zoll" in a weight column is a length; reading it as 12 g would be a silent wrong fact.
    return { weight: null, issues: [issue("weight.length_unit", "warn", "Value carries a length unit, not a weight.", { value: original, ec: "B7" })] };
  } else if (header !== null || opts?.assumeUnit !== undefined) {
    const unit = header ?? opts?.assumeUnit ?? "g";
    grams = gramsOf(tokens[0], unit);
    assumed = header === null;
    issues.push(missingUnitIssue(unit, header !== null, original));
  } else {
    // A bare "1.8" is a kilogram figure; a bare "1800" is grams. Nobody writes 1.8 g for a planter.
    const numberText = tokens[0].text;
    const value = toNumber(numberText);
    const kilograms = /[.,]/.test(numberText) && value < 100;
    grams = kilograms ? value * 1000 : value;
    assumed = true;
    issues.push(missingUnitIssue(kilograms ? "kilograms" : "grams", false, original));
  }

  grams = Math.round(grams + 1e-9);
  if (grams < MIN_GRAMS || grams > MAX_GRAMS) {
    issues.push(
      issue("weight.implausible", "warn", `${grams} g is outside the plausible range (5 g–500 kg); check the unit.`, {
        value: original,
        ec: "B8",
      }),
    );
  }
  return { weight: { grams, assumed, issues }, issues };
}

export function parseWeight(raw: string | null | undefined, opts?: UnitOptions<WeightUnit>): ParsedWeight | null {
  return readWeight(raw, opts).weight;
}

const HEADER_BRACKET_RE = /[([]([^)\]]*)[)\]]/gu;

/**
 * The unit a column header states: "Gewicht (kg)", "Weight [lbs]", "Size (inch)", "Weight kg",
 * "Variant Grams" (EC-B7). Bracketed units win; otherwise only the last word counts, so the "in"
 * of "Weight in g" is a preposition.
 */
export function unitFromHeader(header: string | null | undefined): { weight: WeightUnit | null; length: LengthUnit | null } {
  const none = { weight: null, length: null };
  if (typeof header !== "string") return none;
  const text = header.normalize("NFC").toLowerCase();
  const words = (s: string): string[] => s.split(/[^\p{L}"″”]+/u).filter((w) => w !== "");
  const bracketed = [...text.matchAll(HEADER_BRACKET_RE)].flatMap((m) => words(m[1]));
  const candidates = bracketed.length > 0 ? bracketed : words(text.replace(HEADER_BRACKET_RE, " ")).slice(-1);
  const units = candidates.filter((w) => weightUnitOf(w) !== null || lengthUnitOf(w) !== null);
  // "(Länge in cm)": a preposition "in" loses to a real unit.
  const pick = units.filter((w) => w !== "in").pop() ?? units.pop();
  if (pick === undefined) return none;
  return { weight: weightUnitOf(pick), length: lengthUnitOf(pick) };
}

interface Segment {
  start: number;
  end: number;
  number: string;
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
      number: m[2],
      unit: lengthUnitOf(m[3]),
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
export function parseDimensions(raw: string | null | undefined, opts?: { headerUnit?: LengthUnit | null }): ParsedDimensions | null {
  const original = (raw ?? "").trim();
  const text = clean(raw);
  if (!/\d/.test(text)) return null;

  const segments = readSegments(text);
  if (segments.length === 0) return null;
  const runs = splitRuns(text, segments);
  const best = runs.reduce((a, b) => (b.length > a.length ? b : a));
  if (best.length > 3) return null;
  if (best.length === 1 && best[0].label === null) return null;

  // A unit written once applies to the numbers before it ("20 x 15 cm"); "20 x 15 cm x 10 mm" keeps
  // each number with the nearest unit after it, then before it, then the header's.
  const header = opts?.headerUnit ?? null;
  const unitFor = (i: number): LengthUnit | null =>
    best[i].unit ?? best.slice(i + 1).find((s) => s.unit !== null)?.unit ?? [...best.slice(0, i)].reverse().find((s) => s.unit !== null)?.unit ?? header;
  const anyUnit = best.some((s) => s.unit !== null);
  const unitAssumed = !anyUnit && header === null;

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
  const cmOf = (seg: Segment): number => {
    const unit = unitFor(best.indexOf(seg)) ?? "cm";
    return toCm(toNumber(seg.number, unit === "mm"), unit);
  };

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

  if (!anyUnit) issues.push(missingUnitIssue(header ?? "cm", header !== null, original));
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
