/**
 * Header-row detection, header de-duplication and column → canonical field mapping
 * (EC-A8, A9, A10, A11, B1–B4).
 */

import { CANONICAL_FIELDS, type CanonicalField, type ColumnMapping, type MappingMethod } from "../types";

// ---------------------------------------------------------------------------
// Synonym dictionary (EN / DE / FR). Entries are normalised the same way headers are, so
// punctuation, accents and case do not matter here.
// ---------------------------------------------------------------------------

export const HEADER_SYNONYMS: Readonly<Record<CanonicalField, ReadonlyArray<string>>> = {
  sku: ["sku", "article number", "article no", "artikelnummer", "artikel-nr", "art.-nr.", "art nr", "artnr", "artikelnr", "art no", "item number", "item no", "item code", "item id", "item sku", "product code", "product id", "product sku", "part number", "part no", "ref", "référence", "reference", "code article", "code produit", "n article", "numero article", "numéro d'article", "variant sku", "sku code"],
  parent_sku: ["parent sku", "parent", "parent id", "parent code", "parent article", "parent product", "parent reference", "master sku", "master", "hauptartikel", "elternartikel", "stammartikel", "article parent", "reference parent", "variant of"],
  handle: ["handle", "slug", "url key", "url handle", "product handle", "permalink"],
  title: ["title", "name", "product", "produkt", "produit", "item", "article", "artikel", "product name", "product title", "item name", "article name", "produktname", "produkttitel", "bezeichnung", "artikelname", "artikelbezeichnung", "produktbezeichnung", "titel", "nom", "nom du produit", "nom produit", "nom de l'article", "désignation", "titre", "libellé", "libellé produit", "intitulé"],
  description: ["description", "desc", "body", "body html", "long description", "product description", "full description", "short description", "description html", "details", "beschreibung", "produktbeschreibung", "artikelbeschreibung", "langtext", "kurztext", "kurzbeschreibung", "description longue", "description courte", "description produit", "description du produit", "descriptif"],
  category: ["category", "categories", "product category", "type", "product type", "type de produit", "kategorie", "kategorien", "produktkategorie", "produkttyp", "produktgruppe", "warengruppe", "catégorie", "catégories", "famille", "rubrique", "gamme", "collection", "department"],
  brand: ["brand", "brand name", "marke", "markenname", "marque", "hersteller", "manufacturer", "manufacturer name", "fabricant"],
  vendor: ["vendor", "vendor name", "supplier", "supplier name", "lieferant", "lieferantenname", "fournisseur", "distributor"],
  price: ["price", "unit price", "selling price", "retail price", "sale price", "regular price", "net price", "variant price", "price net", "price gross", "verkaufspreis", "verkaufspreis eur", "vk", "vk-preis", "preis", "preis eur", "preis netto", "preis brutto", "stückpreis", "einzelpreis", "prix", "prix eur", "prix de vente", "prix unitaire", "prix unitaire ht", "prix ht", "prix ttc", "price eur", "price gbp", "price usd", "price chf", "prix chf"],
  compare_at_price: ["compare at price", "compare_at", "compare price", "variant compare at price", "rrp", "msrp", "list price", "was price", "original price", "recommended retail price", "uvp", "uvp preis", "unverbindliche preisempfehlung", "streichpreis", "listenpreis", "prix barré", "prix conseillé", "prix de vente conseillé", "prix public", "prix catalogue", "pvc"],
  cost: ["cost", "costs", "cost price", "unit cost", "cost per item", "cogs", "wholesale", "wholesale price", "trade price", "buy price", "net cost", "purchase price", "cost eur", "cost usd", "cost gbp", "ek", "ekp", "ek-preis", "ek netto", "einkauf", "einkaufspreis", "einstandspreis", "kosten", "selbstkosten", "prix d'achat", "prix d'achat ht", "coût", "coût unitaire", "prix de revient"],
  currency: ["currency", "currency code", "iso currency", "ccy", "curr", "währung", "waehrung", "devise", "monnaie"],
  variant: ["variant", "variant name", "variant title", "variant options", "variante", "variation", "déclinaison", "option", "options"],
  // "size", "colour" and "material" live here; mapColumns re-routes them to the plain
  // size/color/material fields when the sheet has no SKU column (see resolveVariantFamily).
  option_size: ["size", "sizes", "size name", "option size", "größe", "groesse", "grösse", "taille", "pointure", "dimension size"],
  option_color: ["colour", "colours", "color", "colors", "color name", "colour name", "option color", "option colour", "farbe", "farben", "farbbezeichnung", "couleur", "couleurs", "coloris", "teinte"],
  option_material: ["material", "materials", "materiál", "materialien", "matériau", "matériaux", "matière", "matière principale", "werkstoff", "stoff", "fabric", "composition"],
  color: [],
  material: [],
  size: [],
  quantity: ["quantity", "quantities", "qty", "stock", "stock quantity", "stock qty", "stock level", "inventory", "inventory qty", "variant inventory qty", "in stock", "on hand", "units", "pcs", "pieces", "pièces", "stk", "stück", "stueck", "bestand", "lagerbestand", "lager", "menge", "anzahl", "quantité", "qté", "qte", "stock disponible"],
  weight: ["weight", "weight g", "weight kg", "weight in g", "weight in kg", "item weight", "net weight", "gross weight", "shipping weight", "variant weight", "variant grams", "grams", "gewicht", "gewicht g", "gewicht kg", "gewicht in g", "gewicht in kg", "nettogewicht", "bruttogewicht", "poids", "poids g", "poids kg", "poids en g", "poids en kg", "poids net", "poids brut"],
  length: ["length", "length cm", "length mm", "l", "länge", "laenge", "länge cm", "longueur", "longueur cm", "depth", "depth cm", "tiefe", "profondeur"],
  width: ["width", "width cm", "width mm", "w", "b", "breite", "breite cm", "largeur", "largeur cm"],
  height: ["height", "height cm", "height mm", "h", "höhe", "hoehe", "höhe cm", "hauteur", "hauteur cm"],
  diameter: ["diameter", "diameter cm", "diam", "dia", "ø", "ø cm", "ø mm", "durchmesser", "durchmesser cm", "diamètre", "diamètre cm"],
  dimensions: ["dimensions", "dimension", "dims", "dimensions cm", "dimensions mm", "size cm", "size dimensions", "measurements", "l x w x h", "lxwxh", "l x b x h", "lxbxh", "maße", "masse", "maße cm", "abmessung", "abmessungen", "abmessungen cm", "größe cm"],
  image: ["image", "image url", "image link", "image src", "image file", "image name", "image filename", "image 1", "image1", "img", "img url", "main image", "main photo", "featured image", "variant image", "thumbnail", "photo", "photo 1", "photo url", "picture", "picture url", "bild", "bild 1", "bild url", "hauptbild", "produktbild", "foto", "visuel", "url image", "lien image", "image principale"],
  images: ["images", "image urls", "image gallery", "gallery", "gallery images", "additional images", "other images", "more images", "image list", "photos", "bilder", "weitere bilder", "autres images"],
  tags: ["tags", "tag", "keywords", "keyword", "search terms", "labels", "schlagworte", "schlagwörter", "stichwörter", "stichworte", "suchbegriffe", "mots-clés", "étiquettes"],
  notes: ["notes", "note", "remarks", "remark", "comments", "comment", "internal notes", "observations", "bemerkung", "bemerkungen", "hinweis", "hinweise", "anmerkung", "anmerkungen", "remarques", "remarque", "commentaires", "commentaire"],
  care: ["care", "care instructions", "care instruction", "washing instructions", "cleaning", "maintenance", "pflege", "pflegehinweise", "pflegeanleitung", "entretien", "conseils d'entretien", "instructions d'entretien"],
  barcode: ["barcode", "barcode ean", "ean", "ean13", "ean 13", "ean code", "ean gtin", "gtin", "gtin13", "gtin 13", "upc", "upc code", "isbn", "jan", "variant barcode", "strichcode", "code barre", "code ean"],
  country_of_origin: ["country of origin", "origin", "origin country", "country", "made in", "coo", "herkunftsland", "herkunft", "ursprungsland", "hergestellt in", "pays d'origine", "origine", "fabriqué en"],
};

/** Headers containing one of these words describe purchase cost and must never become price (EC-B3). */
const COST_WORDS = new Set(["cost", "costs", "cogs", "ek", "ekp", "einkauf", "einkaufspreis", "einstandspreis", "kosten", "selbstkosten", "wholesale", "purchase", "achat", "cout", "revient"]);

const EXACT_INDEX = new Map<string, CanonicalField>();
const SYNONYM_INDEX = new Map<string, CanonicalField>();
for (const field of CANONICAL_FIELDS) {
  EXACT_INDEX.set(normaliseHeader(field.replace(/_/g, " ")), field);
  for (const synonym of HEADER_SYNONYMS[field]) {
    const key = normaliseHeader(synonym);
    if (key && !SYNONYM_INDEX.has(key)) SYNONYM_INDEX.set(key, field);
  }
}
/** Fuzzy candidates: short keys like "vk" or "l" would match too much. */
const FUZZY_CANDIDATES = [...EXACT_INDEX, ...SYNONYM_INDEX].filter(([key]) => key.length >= 4);

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

function stripAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/ø/g, "o");
}

/** Lower-case, accent-free, bracket content removed, punctuation → space. "Art.-Nr. (EAN)" → "art nr". */
function normaliseHeader(raw: string): string {
  return stripAccents(raw.toLowerCase())
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Key form used for RawRow cells: "Price (EUR)" → "price_eur". */
function snakeCase(raw: string): string {
  return stripAccents(raw.toLowerCase())
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

// ---------------------------------------------------------------------------
// Header row detection (EC-A8, A9)
// ---------------------------------------------------------------------------

const MAX_HEADER_SCAN = 20;
const MAX_HEADER_CELL_LENGTH = 40;
const MIN_HEADER_RATIO = 0.6;
const DATE_RE = /^\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}$/;
const SCIENTIFIC_RE = /^-?\d+(\.\d+)?E[+-]?\d+$/i;

type CellType = "empty" | "num" | "code" | "long" | "text";

interface RowProfile {
  types: CellType[];
  nonEmpty: number;
  headerLike: number;
  hasNumeric: boolean;
  synonymHits: number;
  unique: number;
}

function looksNumeric(cell: string): boolean {
  const t = cell.trim();
  if (DATE_RE.test(t) || SCIENTIFIC_RE.test(t)) return true;
  const stripped = t.replace(/^[-+]?\s*[$€£¥]\s*/, "").replace(/\s*[a-z%€£$¥"']{1,4}$/i, "");
  return /^[-+]?\d[\d\s.,']*$/.test(stripped);
}

function cellType(cell: string): CellType {
  const t = cell.trim();
  if (t === "") return "empty";
  if (looksNumeric(t)) return "num";
  if (t.length > MAX_HEADER_CELL_LENGTH) return "long";
  return /\d/.test(t) ? "code" : "text";
}

function profileRow(row: string[]): RowProfile {
  const types = row.map(cellType);
  const nonEmptyCells = row.filter((c) => c.trim() !== "");
  const keys = nonEmptyCells.map((c) => normaliseHeader(c));
  return {
    types,
    nonEmpty: nonEmptyCells.length,
    headerLike: types.filter((t) => t === "text" || t === "code").length,
    hasNumeric: types.includes("num"),
    synonymHits: keys.filter((k) => EXACT_INDEX.has(k) || SYNONYM_INDEX.has(k)).length,
    unique: new Set(keys).size,
  };
}

/** A header is followed by data: some text column turns numeric/coded/long, or the row widens. */
function profileDiffers(candidate: RowProfile, next: RowProfile): boolean {
  if (next.nonEmpty > candidate.nonEmpty) return true;
  return candidate.types.some((t, i) => {
    const n = next.types[i] ?? "empty";
    return t === "text" && (n === "num" || n === "code" || n === "long");
  });
}

export function detectHeaderRow(rows: string[][]): { index: number; confidence: number } | null {
  const scan = Math.min(rows.length, MAX_HEADER_SCAN);
  const profiles = rows.slice(0, scan + MAX_HEADER_SCAN).map(profileRow);
  const maxWidth = Math.max(1, ...profiles.map((p) => p.nonEmpty));
  let best: { index: number; score: number } | null = null;

  for (let i = 0; i < scan; i++) {
    const p = profiles[i];
    if (p.nonEmpty <= 1) continue; // title rows, notes, blank lines
    const ratio = p.headerLike / p.nonEmpty;
    if (ratio < MIN_HEADER_RATIO) continue;
    // A row with numbers in it is only a header if we recognise at least one of its labels.
    if (p.hasNumeric && p.synonymHits === 0) continue;

    const next = profiles.slice(i + 1).find((q) => q.nonEmpty >= 2) ?? profiles.slice(i + 1).find((q) => q.nonEmpty >= 1);
    // Mostly known labels ("Name, Description, Notes") make a header even above text-only data.
    const recognised = p.synonymHits >= 2 && p.synonymHits * 2 >= p.nonEmpty;
    if (next && !profileDiffers(p, next) && !recognised) continue;
    // The last row with nothing below it is only a header-only sheet when we know its labels;
    // otherwise it is the last data row of a text-only table.
    if (!next && p.synonymHits === 0) continue;

    let score =
      0.4 * ratio +
      0.2 * (p.nonEmpty / maxWidth) +
      0.25 * (p.synonymHits / p.nonEmpty) +
      0.15 * (p.unique / p.nonEmpty);
    if (!next) score *= 0.7; // nothing below to confirm it
    if (best === null || score > best.score + 1e-9) best = { index: i, score };
  }

  return best ? { index: best.index, confidence: Math.round(best.score * 100) } : null;
}

// ---------------------------------------------------------------------------
// De-duplication (EC-A10)
// ---------------------------------------------------------------------------

export function dedupeHeaders(headers: string[]): string[] {
  const used = new Set<string>();
  return headers.map((raw, index) => {
    const base = snakeCase(raw.replace(/\s+/g, " ").trim()) || `column_${index + 1}`;
    let name = base;
    for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
    used.add(name);
    return name;
  });
}

// ---------------------------------------------------------------------------
// Column mapping (EC-A11, B1–B4)
// ---------------------------------------------------------------------------

const MONEY_RE = /^[-+]?\s*[$€£¥]?\s*\d[\d\s.,']*\s*(?:[$€£¥]|eur|usd|gbp|chf)?\s*$/i;
const STRICT_MONEY_RE = /^[-+]?\s*(?:[$€£¥]\s*\d[\d\s.,']*|\d[\d\s.,']*\s*(?:[$€£¥]|eur|usd|gbp|chf)|\d[\d\s.']*[.,]\d{2})\s*$/i;
const IMAGE_VALUE_RE = /\.(?:jpe?g|png|webp|gif)(?:\?\S*)?$/i;
const CONTENT_MAJORITY = 0.7;
const CONFIDENCE: Record<MappingMethod, number> = { exact: 100, synonym: 90, fuzzy: 75, content: 50, none: 0 };

type Match = { canonical: CanonicalField | null; via: MappingMethod; confidence: number };

/**
 * `headers` are the raw header cells as they appear in the file; de-duplication happens here so
 * two "Price" columns both reach the price rule and content decides between them.
 */
export function mapColumns(headers: string[], sampleRows: string[][]): ColumnMapping[] {
  const deduped = dedupeHeaders(headers);
  const mappings: ColumnMapping[] = headers.map((raw, index) => ({
    ...matchHeader(normaliseHeader(raw)),
    header: deduped[index],
    originalHeader: raw,
    index,
  }));
  const samples = headers.map((_, index) => columnSamples(sampleRows, index));
  applyContentMapping(mappings, samples);
  resolveVariantFamily(mappings);
  resolveConflicts(mappings, samples);
  return mappings;
}

/** Shopify's "Option1 Name"/"Option1 Value" pairs are read by the row cleaner, never mapped to a field. */
const SHOPIFY_OPTION_KEY_RE = /^option ?[1-3] (?:name|value)$/;

function matchHeader(key: string): Match {
  if (!key || SHOPIFY_OPTION_KEY_RE.test(key)) return { canonical: null, via: "none", confidence: 0 };
  const costLike = isCostLike(key);
  const exact = EXACT_INDEX.get(key);
  if (exact) return finish(exact, "exact", costLike);
  const synonym = SYNONYM_INDEX.get(key);
  if (synonym) return finish(synonym, "synonym", costLike);
  const fuzzy = fuzzyMatch(key);
  if (fuzzy) return { ...finish(fuzzy.field, "fuzzy", costLike), confidence: fuzzy.distance === 1 ? 75 : 65 };
  return { canonical: null, via: "none", confidence: 0 };
}

function finish(field: CanonicalField, via: MappingMethod, costLike: boolean): Match {
  // "Cost price", "EK" and friends are never a selling price (EC-B3).
  const canonical = field === "price" && costLike ? "cost" : field;
  return { canonical, via, confidence: CONFIDENCE[via] };
}

function isCostLike(key: string): boolean {
  return key.split(" ").some((word) => COST_WORDS.has(word));
}

function fuzzyMatch(key: string): { field: CanonicalField; distance: number } | null {
  if (key.length < 6) return null;
  // One edit for short labels, two for long ones: "content" must not become "comment".
  const maxDistance = key.length >= 10 ? 2 : 1;
  let best: { field: CanonicalField; distance: number } | null = null;
  for (const [candidate, field] of FUZZY_CANDIDATES) {
    if (Math.abs(candidate.length - key.length) > maxDistance) continue;
    const distance = damerauLevenshtein(key, candidate, maxDistance);
    if (distance <= maxDistance && (best === null || distance < best.distance)) best = { field, distance };
    if (best?.distance === 1) break;
  }
  return best;
}

/** Optimal string alignment distance, capped so we can stop early. */
function damerauLevenshtein(a: string, b: string, cap: number): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    let rowMin = Number.POSITIVE_INFINITY;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2][j - 2] + 1);
      d[i][j] = v;
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > cap) return cap + 1;
  }
  return d[a.length][b.length];
}

function columnSamples(rows: string[][], index: number): string[] {
  return rows.map((row) => (row[index] ?? "").trim()).filter((v) => v !== "");
}

function fraction(samples: string[], test: (v: string) => boolean): number {
  return samples.length === 0 ? 0 : samples.filter(test).length / samples.length;
}

/** Unmapped columns whose values give them away: money → price, image files → image. */
function applyContentMapping(mappings: ColumnMapping[], samples: string[][]): void {
  let hasPrice = mappings.some((m) => m.canonical === "price");
  let hasImage = mappings.some((m) => m.canonical === "image");
  let hasImages = mappings.some((m) => m.canonical === "images");
  for (const m of mappings) {
    if (m.canonical !== null || m.via !== "none" || SHOPIFY_OPTION_KEY_RE.test(normaliseHeader(m.originalHeader))) continue;
    const values = samples[m.index];
    if (values.length === 0) continue;
    if (!hasPrice && !isCostLike(normaliseHeader(m.originalHeader)) && fraction(values, (v) => STRICT_MONEY_RE.test(v)) >= CONTENT_MAJORITY) {
      assign(m, "price", "content");
      hasPrice = true;
    } else if (fraction(values, (v) => IMAGE_VALUE_RE.test(v)) >= CONTENT_MAJORITY) {
      if (!hasImage) {
        assign(m, "image", "content");
        hasImage = true;
      } else if (!hasImages) {
        assign(m, "images", "content");
        hasImages = true;
      }
    }
  }
}

/** Size/colour/material are variant options when the sheet has SKUs, plain attributes otherwise. */
function resolveVariantFamily(mappings: ColumnMapping[]): void {
  const hasSku = mappings.some((m) => m.canonical === "sku");
  const family: Partial<Record<CanonicalField, [CanonicalField, CanonicalField]>> = {
    size: ["option_size", "size"],
    option_size: ["option_size", "size"],
    color: ["option_color", "color"],
    option_color: ["option_color", "color"],
    material: ["option_material", "material"],
    option_material: ["option_material", "material"],
  };
  for (const m of mappings) {
    if (m.canonical === null) continue;
    const pair = family[m.canonical];
    if (pair) m.canonical = hasSku ? pair[0] : pair[1];
  }
}

function resolveConflicts(mappings: ColumnMapping[], samples: string[][]): void {
  const groups = new Map<CanonicalField, ColumnMapping[]>();
  for (const m of mappings) {
    if (m.canonical === null) continue;
    groups.set(m.canonical, [...(groups.get(m.canonical) ?? []), m]);
  }
  for (const [canonical, group] of groups) {
    if (group.length < 2) continue;
    let winner = group[0];
    let demotedVia: MappingMethod = "none";
    if (canonical === "price") {
      winner = argmax(group, (m) => fraction(samples[m.index], (v) => MONEY_RE.test(v)));
      demotedVia = "content";
    } else if (canonical === "description") {
      winner = argmax(group, (m) => averageLength(samples[m.index]));
      demotedVia = "content";
    }
    for (const m of group) {
      if (m !== winner) assign(m, null, demotedVia);
    }
  }
}

function argmax<T>(items: T[], score: (item: T) => number): T {
  let best = items[0];
  let bestScore = score(best);
  for (const item of items.slice(1)) {
    const s = score(item);
    if (s > bestScore) {
      best = item;
      bestScore = s;
    }
  }
  return best;
}

function averageLength(samples: string[]): number {
  return samples.length === 0 ? 0 : samples.reduce((sum, v) => sum + v.length, 0) / samples.length;
}

function assign(m: ColumnMapping, canonical: CanonicalField | null, via: MappingMethod): void {
  m.canonical = canonical;
  m.via = via;
  m.confidence = canonical === null ? 0 : CONFIDENCE[via];
}
