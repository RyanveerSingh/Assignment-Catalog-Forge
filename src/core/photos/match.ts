/**
 * Photo → product/variant matching (EC-C12, C13, C15, A17). Exact rungs first (image column,
 * SKU, product key, handle), then a cautious fuzzy rung; anything else goes to the unmatched bin
 * rather than to the wrong product. Only basenames are trusted: ZIP paths are untrusted input.
 */
import { slugify } from "../clean/row";
import { foldForMatch } from "../clean/text";
import { damerauLevenshtein } from "../group/similarity";
import type { PhotoMatch, PhotoMatchMethod, ProductGroup } from "../types";

export interface PhotoMatchResult {
  matches: PhotoMatch[];
  missingReferences: Array<{ productKey: string; filename: string }>;
}

interface Target {
  productKey: string;
  sku: string | null;
}

interface Hit extends Target {
  method: PhotoMatchMethod;
}

interface Reference {
  productKey: string;
  filename: string;
  stem: string;
}

interface Index {
  images: Map<string, Target>;
  skus: Map<string, Target>;
  keys: Map<string, string>;
  handles: Map<string, string>;
  skuList: Array<Target & { folded: string }>;
  references: Reference[];
}

const SCORES: Readonly<Record<PhotoMatchMethod, number>> = { image_column: 100, sku: 95, sku_stem: 85, handle: 80, fuzzy: 60, none: 0 };
const RANK: Readonly<Record<PhotoMatchMethod, number>> = { image_column: 0, sku: 1, sku_stem: 2, handle: 3, fuzzy: 4, none: 5 };
const FUZZY_MIN_STEM = 6;
const FUZZY_MAX_DISTANCE = 2;
const URL_RE = /^https?:\/\//i;
const EXTENSION_RE = /\.[a-z0-9]{1,5}$/i;
// A two-digit "-20" is a SKU suffix far more often than a 20th photo, so only "-2" and "-02" are sequences.
const SEQUENCE_RES: ReadonlyArray<RegExp> = [
  /[ _-]*\(\s*(\d{1,3})\s*\)$/u,
  /_(\d{1,2})$/u,
  /-(\d|0\d)$/u,
  /[_-](?:front|back|side|top|main|hero|detail|thumb|alt)(\d{0,2})$/iu,
];

function basename(filename: string): string {
  if (typeof filename !== "string") return "";
  return filename.split(/[\\/]+/).filter((p) => p !== "").pop() ?? "";
}

function stripExtension(name: string): string {
  return name.replace(EXTENSION_RE, "");
}

/** "photos/TC-PL-20_2.jpg" → { stem: "tc pl 20", sequence: 2 }; "x.png" → { stem: "x", sequence: null }. */
export function normalizePhotoStem(filename: string): { stem: string; sequence: number | null } {
  let name = stripExtension(basename(filename));
  let sequence: number | null = null;
  for (let pass = 0; pass < 3; pass++) {
    const before = name;
    for (const re of SEQUENCE_RES) {
      const m = re.exec(name);
      if (!m) continue;
      name = name.slice(0, m.index);
      if (sequence === null && m[1] !== undefined && m[1] !== "") sequence = Number(m[1]);
      break;
    }
    if (name === before) break;
  }
  return { stem: foldForMatch(name), sequence };
}

export function matchPhotos(filenames: string[], groups: ProductGroup[]): PhotoMatchResult {
  const files = Array.isArray(filenames) ? filenames.filter((f): f is string => typeof f === "string" && f !== "") : [];
  const index = buildIndex(Array.isArray(groups) ? groups : []);
  const seenStems = new Set<string>();
  const pending: Array<{ filename: string; hit: Hit | null; sequence: number | null }> = [];

  for (const filename of files) {
    const raw = foldForMatch(stripExtension(basename(filename)));
    const norm = normalizePhotoStem(filename);
    seenStems.add(raw);
    seenStems.add(norm.stem);

    const hitStripped = exactHit(norm.stem, index);
    const hitRaw = raw === norm.stem ? null : exactHit(raw, index);
    let hit = hitStripped;
    let sequence = norm.sequence;
    if (hitRaw && (!hitStripped || RANK[hitRaw.method] <= RANK[hitStripped.method])) {
      // The full name matched at least as well: the suffix belongs to the identifier ("TC-PL-2")
      // unless both forms point at the same target, in which case it really was a sequence.
      const same = hitStripped !== null && sameTarget(hitRaw, hitStripped);
      hit = same ? hitStripped : hitRaw;
      if (!same) sequence = null;
    }
    if (!hit) hit = fuzzyHit(norm.stem, index);
    pending.push({ filename, hit, sequence });
  }

  const matches = assignPositions(pending);
  const missingReferences = index.references
    .filter((r) => !seenStems.has(r.stem))
    .map((r) => ({ productKey: r.productKey, filename: r.filename }));
  return { matches, missingReferences };
}

function sameTarget(a: Target, b: Target): boolean {
  return a.productKey === b.productKey && a.sku === b.sku;
}

function exactHit(stem: string, index: Index): Hit | null {
  if (stem === "") return null;
  const image = index.images.get(stem);
  if (image) return { ...image, method: "image_column" };
  const sku = index.skus.get(stem);
  if (sku) return { ...sku, method: "sku" };
  const key = index.keys.get(stem);
  if (key !== undefined) return { productKey: key, sku: null, method: "sku_stem" };
  const handle = index.handles.get(stem);
  if (handle !== undefined) return { productKey: handle, sku: null, method: "handle" };
  return null;
}

/** Unique best SKU within two edits; ties mean we do not know, so the photo stays unmatched. */
function fuzzyHit(stem: string, index: Index): Hit | null {
  if (stem.length < FUZZY_MIN_STEM) return null;
  let best: Target | null = null;
  let bestDistance = FUZZY_MAX_DISTANCE + 1;
  let bestCount = 0;
  for (const candidate of index.skuList) {
    if (Math.abs(candidate.folded.length - stem.length) > FUZZY_MAX_DISTANCE) continue;
    const d = damerauLevenshtein(stem, candidate.folded, FUZZY_MAX_DISTANCE);
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
      bestCount = 1;
    } else if (d === bestDistance) bestCount++;
  }
  if (!best || bestDistance > FUZZY_MAX_DISTANCE || bestCount !== 1) return null;
  return { productKey: best.productKey, sku: best.sku, method: "fuzzy" };
}

/** Explicit sequences claim their slots first; the rest fill the gaps in filename order. */
function assignPositions(pending: Array<{ filename: string; hit: Hit | null; sequence: number | null }>): PhotoMatch[] {
  const used = new Map<string, Set<number>>();
  const claim = (productKey: string, from: number): number => {
    const slots = used.get(productKey) ?? new Set<number>();
    used.set(productKey, slots);
    let pos = Math.max(0, from);
    while (slots.has(pos)) pos++;
    slots.add(pos);
    return pos;
  };
  const positions: number[] = pending.map(() => 0);
  pending.forEach((p, i) => {
    if (p.hit && p.sequence !== null) positions[i] = claim(p.hit.productKey, p.sequence - 1);
  });
  let unmatched = 0;
  pending.forEach((p, i) => {
    if (!p.hit) positions[i] = unmatched++;
    else if (p.sequence === null) positions[i] = claim(p.hit.productKey, 0);
  });
  return pending.map((p, i) => ({
    filename: p.filename,
    productKey: p.hit ? p.hit.productKey : null,
    sku: p.hit ? p.hit.sku : null,
    position: positions[i],
    method: p.hit ? p.hit.method : "none",
    score: SCORES[p.hit ? p.hit.method : "none"],
  }));
}

function buildIndex(groups: ProductGroup[]): Index {
  const index: Index = { images: new Map(), skus: new Map(), keys: new Map(), handles: new Map(), skuList: [], references: [] };
  const setOnce = <V>(map: Map<string, V>, key: string, value: V): void => {
    if (key !== "" && !map.has(key)) map.set(key, value);
  };
  for (const group of groups) {
    const productKey = group.productKey;
    setOnce(index.keys, foldForMatch(productKey), productKey);
    if (group.title) setOnce(index.handles, foldForMatch(slugify(group.title)), productKey);

    // An image referenced by exactly one variant is that variant's; shared ones belong to the product.
    const referrers = new Map<string, Set<string>>();
    for (const v of group.variants) {
      for (const img of v.images) {
        const set = referrers.get(img) ?? new Set<string>();
        set.add(v.sku);
        referrers.set(img, set);
      }
      const folded = foldForMatch(v.sku);
      setOnce(index.skus, folded, { productKey, sku: v.sku });
      if (folded !== "") index.skuList.push({ productKey, sku: v.sku, folded });
    }
    const seen = new Set<string>();
    for (const img of [...group.images, ...group.variants.flatMap((v) => v.images)]) {
      if (typeof img !== "string" || img === "" || URL_RE.test(img) || seen.has(img)) continue;
      seen.add(img);
      const owners = referrers.get(img);
      const sku = owners && owners.size === 1 ? [...owners][0] : null;
      // Indexed by the full basename stem: "planter-front" and "planter-hero" must stay distinct references.
      const stem = foldForMatch(stripExtension(basename(img)));
      if (stem === "") continue;
      setOnce(index.images, stem, { productKey, sku });
      index.references.push({ productKey, filename: img, stem });
    }
  }
  return index;
}
