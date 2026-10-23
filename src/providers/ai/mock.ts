import { CLAIM_LEXICON } from "@/core/ai/lexicon";
import type { EnrichInput, EnrichProductInput, TranslateInput } from "@/core/ai/prompts";
import type { AiEnrichBatch, AiProductOutput, AiTranslateBatch } from "@/core/ai/schema";
import { resolveSourceCategory, TAXONOMY, TAXONOMY_FALLBACK } from "@/core/ai/taxonomy";
import { isNegated, tokenizeClauses } from "@/core/ai/negation";
import { locateQuote } from "@/core/ai/quote";
import { foldForMatch } from "@/core/clean/text";
import { CATEGORY_KEYWORDS } from "./mock-categories";
import { AiError } from "./errors";
import { costMicros } from "./pricing";
import type { AiBatchHandle, AiBatchResult, AiProvider, AiRequest, AiResponse, AiUsage } from "./types";

/**
 * Demo-mode provider: a deterministic, rule-based stand-in so the whole pipeline runs with no API key.
 * It writes like a careful model (claims cite the cell's own words and never assert what the cell
 * negates); the chaos panel's "invented claim" knob is how a demo makes the grounding validator fire.
 */
export function createMockProvider(): AiProvider {
  const batches = new Map<string, Array<AiBatchResult<unknown>>>();
  let batchSeq = 0;

  async function run<T>(req: AiRequest<T>): Promise<AiResponse<T>> {
    const started = Date.now();
    let output: unknown;
    switch (req.purpose) {
      case "enrich":
      case "vision":
      case "repair":
      case "eval":
        output = enrich(req.input as EnrichInput, req.purpose === "vision");
        break;
      case "translate":
        output = translate(req.input as TranslateInput);
        break;
    }
    const parsed = req.schema.safeParse(output);
    if (!parsed.success) {
      throw new AiError("invalid_json", `mock output did not match schema: ${parsed.error.message}`);
    }
    const rawText = JSON.stringify(output);
    // Token counts approximate the real provider's (4 chars per token, system prompt served from cache)
    // so the demo's cost figures are realistic estimates rather than zeros.
    const usage: AiUsage = {
      inputTokens: Math.ceil(req.userText.length / 4),
      outputTokens: Math.ceil(rawText.length / 4),
      cacheReadTokens: Math.ceil(req.system.length / 4),
      cacheWriteTokens: 0,
    };
    await new Promise((r) => setTimeout(r, 30 + Math.min(200, req.userText.length / 200)));
    return { output: parsed.data, rawText, usage, model: req.model, latencyMs: Date.now() - started, stopReason: "end_turn", costMicros: costMicros(req.model, usage), batched: false };
  }

  return {
    name: "mock",
    complete: run,
    async createBatch<T>(reqs: Array<AiRequest<T> & { customId: string }>): Promise<AiBatchHandle> {
      // Unique per process: an id from before a restart must look unknown, not collide with a new batch.
      const id = `mock-batch-${process.pid}-${Date.now().toString(36)}-${++batchSeq}`;
      const results: Array<AiBatchResult<unknown>> = [];
      for (const r of reqs) {
        try {
          const response = await run(r);
          results.push({ customId: r.customId, result: { type: "succeeded", response: { ...response, batched: true } } });
        } catch (err) {
          results.push({ customId: r.customId, result: { type: "errored", error: String(err), retryable: true } });
        }
      }
      batches.set(id, results);
      return { batchId: id, requestCount: reqs.length };
    },
    async batchStatus(batchId) {
      const results = batches.get(batchId) ?? [];
      const succeeded = results.filter((r) => r.result.type === "succeeded").length;
      return { status: "ended", counts: { processing: 0, succeeded, errored: results.length - succeeded, expired: 0, canceled: 0 } };
    },
    async *batchResults<T>(batchId: string): AsyncIterable<AiBatchResult<T>> {
      for (const r of batches.get(batchId) ?? []) yield r as AiBatchResult<T>;
    },
  };
}

// --- enrichment rules ---------------------------------------------------------

// A size token must be its own word ("Bowl" is not "Bow" + size L): require a separator or space before it.
const OPTION_TAIL = /(?:\s+|\s*[-–,|/(]\s*)(\d+([.,]\d+)?\s?(cm|mm|m|in|inch|"|l|ml|kg|g)\b|xs|s|m|l|xl|xxl|small|medium|large)\s*\)?\s*$/i;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 2 || w === "&" ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ")
    .replace(/\bAnd\b/g, "and")
    .replace(/\bOf\b/g, "of")
    .replace(/\bWith\b/g, "with");
}

/** Common home-goods nouns and connectives in German and French, so a demo listing reads in English like a real one would. */
const TITLE_WORDS: Readonly<Record<string, string>> = {
  kerze: "candle", kerzen: "candles", stumpenkerze: "pillar candle", teelicht: "tealight", teelichter: "tealights", bienenwachs: "beeswax",
  tasse: "cup", tassen: "cups", becher: "mug", teekanne: "teapot", kanne: "pot", schale: "bowl", schussel: "bowl", teller: "plate",
  giesskanne: "watering can", teppich: "rug", kissen: "cushion", decke: "blanket", handtuch: "towel", vase: "vase", korb: "basket",
  spiegel: "mirror", uhr: "clock", lampe: "lamp", leuchte: "lamp", tisch: "table", stuhl: "chair", hocker: "stool", regal: "shelf",
  topf: "pot", pfanne: "pan", messer: "knife", brett: "board", notizbuch: "notebook", stift: "pen", bleistift: "pencil",
  hund: "dog", katze: "cat", spielzeug: "toy", holz: "wood", leinen: "linen", baumwolle: "cotton", wolle: "wool", keramik: "ceramic",
  glas: "glass", stahl: "steel", eiche: "oak", ubertopf: "planter", blumentopf: "plant pot",
  bougie: "candle", bougies: "candles", tasses: "cups", tapis: "rug", coussin: "cushion", couverture: "blanket", table: "table", chaise: "chair",
  tabouret: "stool", etagere: "shelf", bol: "bowl", assiette: "plate", theiere: "teapot", arrosoir: "watering can", serviette: "towel",
  panier: "basket", miroir: "mirror", horloge: "clock", casserole: "saucepan", poele: "pan", couteau: "knife", planche: "board",
  chien: "dog", chat: "cat", jouet: "toy", carnet: "notebook", stylo: "pen", crayon: "pencil", cire: "wax", bois: "wood", lin: "linen",
  coton: "cotton", laine: "wool", ceramique: "ceramic", verre: "glass", acier: "steel", chene: "oak", expresso: "espresso",
  de: "of", des: "of", en: "in", et: "and", avec: "with", pour: "for", mit: "with", und: "and", aus: "in",
};
const TITLE_DROP = new Set(["a", "la", "le", "les", "der", "die", "das", "au", "aux", "du"]);

/** Word-by-word rendering of a German or French title into English; unknown words pass through. */
function anglicizeTitle(raw: string): string {
  return raw
    .split(/[\s-]+/)
    .map((word) => {
      const key = foldForMatch(word);
      if (TITLE_DROP.has(key)) return "";
      return TITLE_WORDS[key] ?? word;
    })
    .filter(Boolean)
    .join(" ");
}

function deriveTitle(p: EnrichProductInput): { title: string; confidence: number; reason: string | null } {
  let raw = (p.source_title ?? "").trim();
  if (!raw) {
    const parts = [p.color, p.material, p.category_hint].filter((x): x is string => !!x);
    if (parts.length) return { title: titleCase(parts.join(" ")), confidence: 45, reason: "No title in source; built from material/category" };
    return { title: "Untitled Product", confidence: 20, reason: "No title in source" };
  }
  let guard = 0;
  while (OPTION_TAIL.test(raw) && guard++ < 3) raw = raw.replace(OPTION_TAIL, "").trim();
  raw = raw.replace(/\s{2,}/g, " ").replace(/[-–,|/]+$/g, "").trim();
  const english = p.language === "de" || p.language === "fr" ? anglicizeTitle(raw) : raw;
  return { title: titleCase(english), confidence: 95, reason: null };
}

function deriveCategory(p: EnrichProductInput, title: string): { category: string; confidence: number; reason: string | null } {
  // The supplier's own category column, when it maps to the taxonomy, beats any keyword guess; a
  // keyword may only refine it to a leaf beneath it ("Vaisselle" → Tableware, "cup set" → Coffee & Tea Sets).
  const fromSource = p.category_hint ? resolveSourceCategory(p.category_hint) : null;
  // The title names the product; the description only disambiguates, so it is searched second.
  const titleHay = `${title} ${p.category_hint ?? ""}`.toLowerCase();
  const fromTitle = CATEGORY_KEYWORDS.find(([re]) => re.test(titleHay))?.[1] ?? null;
  if (fromSource) {
    const refined = fromTitle && !TAXONOMY.includes(fromSource) && fromTitle.startsWith(`${fromSource} > `) ? fromTitle : fromSource;
    return { category: refined, confidence: 80, reason: null };
  }
  if (fromTitle) return { category: fromTitle, confidence: 88, reason: null };
  const descHay = (p.source_description ?? "").toLowerCase();
  for (const [re, path] of CATEGORY_KEYWORDS) {
    if (re.test(descHay)) return { category: path, confidence: 72, reason: null };
  }
  if (p.category_hint) {
    const hint = p.category_hint.toLowerCase();
    const match = TAXONOMY.find((t) => t.toLowerCase().includes(hint));
    if (match) return { category: match, confidence: 70, reason: null };
  }
  return { category: TAXONOMY_FALLBACK, confidence: 40, reason: "Category unclear from the source" };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findClaims(p: EnrichProductInput): AiProductOutput["claims"] {
  const claims: AiProductOutput["claims"] = [];
  const seen = new Set<string>();
  for (const r of p.rows) {
    for (const [column, value] of Object.entries(r.cells)) {
      if (!value) continue;
      const folded = ` ${fold(value)} `;
      for (const entry of CLAIM_LEXICON) {
        if (seen.has(entry.term)) continue;
        const hit = entry.variants.find((v) => folded.includes(` ${v} `));
        // A careful writer never asserts what the cell negates; the chaos panel can inject that on purpose.
        if (hit && !isNegated(tokenizeClauses(value), [hit])) {
          seen.add(entry.term);
          // Quote the words as the supplier wrote them, exactly as a careful model would.
          const span = locateQuote(value, hit);
          const quote = span ? value.slice(span.start, span.end) : value.slice(0, 60);
          claims.push({ text: entry.term, source_row: r.row, source_column: column, quote });
        }
      }
    }
  }
  return claims;
}

function enrich(input: EnrichInput, vision: boolean): AiEnrichBatch {
  const products: AiProductOutput[] = input.products.map((p) => {
    const t = deriveTitle(p);
    const c = deriveCategory(p, t.title);
    const reasons: string[] = [];
    if (t.reason) reasons.push(t.reason);
    if (c.reason) reasons.push(c.reason);
    const conflict = p.issues.find((i) => /conflict/i.test(i));
    if (conflict) reasons.push(conflict);

    const descSource = (p.source_description ?? "").trim();
    const paragraphs: string[] = [];
    if (descSource) paragraphs.push(`<p>${escapeHtml(descSource.slice(0, 600))}</p>`);
    else {
      const bits = [p.material ? `made of ${p.material}` : null, p.color ? `in ${p.color}` : null].filter(Boolean).join(" ");
      paragraphs.push(`<p>${escapeHtml(t.title)}${bits ? `, ${bits}` : ""}.${vision ? " Details confirmed from the product photo." : ""}</p>`);
    }
    if (p.care) paragraphs.push(`<p><strong>Care:</strong> ${escapeHtml(p.care)}</p>`);
    const descriptionHtml = paragraphs.join("");

    const attributes: Array<{ name: string; value: string }> = [];
    if (p.material) attributes.push({ name: "material", value: p.material });
    if (p.color) attributes.push({ name: "color", value: p.color });
    if (p.care) attributes.push({ name: "care", value: p.care });
    if (p.brand) attributes.push({ name: "brand", value: p.brand });
    for (const [k, v] of Object.entries(p.attributes).slice(0, 4)) attributes.push({ name: k, value: v });

    const tagSet = new Set<string>();
    for (const s of [p.material, p.color, ...p.tags]) if (s) tagSet.add(s.toLowerCase());
    for (const w of c.category.split(" > ").pop()!.toLowerCase().split(/[^a-z]+/)) if (w.length > 3) tagSet.add(w);
    for (const w of t.title.toLowerCase().split(/[^a-z]+/)) if (w.length > 4 && tagSet.size < 8) tagSet.add(w);

    const plain = descriptionHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const metaTitle = `${t.title}${p.brand ? ` | ${p.brand}` : ""}`.slice(0, 60);
    const metaDescription = plain.slice(0, 150);

    return {
      product_key: p.product_key,
      title: t.title,
      description_html: descriptionHtml,
      category: c.category,
      tags: [...tagSet].slice(0, 8),
      attributes,
      claims: findClaims(p),
      confidence: {
        title: t.confidence,
        description: descSource ? 85 : 65,
        category: c.confidence,
        tags: 80,
        attributes: attributes.length ? 78 : 50,
      },
      status: reasons.length ? "needs_review" : "ok",
      review_reason: reasons.length ? reasons.join("; ") : null,
      meta_title: metaTitle,
      meta_description: metaDescription,
      source_language: p.language === "de" || p.language === "fr" || p.language === "en" ? p.language : "other",
    };
  });
  return { products };
}

// --- translation rules ----------------------------------------------------------

const DICTIONARY: Record<string, Record<string, string>> = {
  de: {
    planter: "Übertopf", mug: "Tasse", cushion: "Kissen", candle: "Kerze", vase: "Vase", towel: "Handtuch", blanket: "Decke", lamp: "Lampe", chair: "Stuhl", table: "Tisch", bowl: "Schüssel", plate: "Teller", knife: "Messer", soap: "Seife",
    with: "mit", and: "und", for: "für", the: "der", of: "aus", in: "in", handmade: "handgefertigt", natural: "natürlich", care: "Pflege", material: "Material", color: "Farbe", colour: "Farbe", size: "Größe",
    terracotta: "Terrakotta", ceramic: "Keramik", cotton: "Baumwolle", wood: "Holz", glass: "Glas", wool: "Wolle", linen: "Leinen", black: "Schwarz", white: "Weiß", blue: "Blau", green: "Grün", red: "Rot", grey: "Grau",
    drainage: "Abfluss", hole: "Loch", indoors: "drinnen", bring: "bringen", below: "unter", wash: "waschen", cold: "kalt", dishwasher: "Spülmaschine", safe: "geeignet",
  },
  fr: {
    planter: "pot de fleurs", mug: "tasse", cushion: "coussin", candle: "bougie", vase: "vase", towel: "serviette", blanket: "couverture", lamp: "lampe", chair: "chaise", table: "table", bowl: "bol", plate: "assiette", knife: "couteau", soap: "savon",
    with: "avec", and: "et", for: "pour", the: "le", of: "en", in: "en", handmade: "fait main", natural: "naturel", care: "entretien", material: "matériau", color: "couleur", colour: "couleur", size: "taille",
    terracotta: "terre cuite", ceramic: "céramique", cotton: "coton", wood: "bois", glass: "verre", wool: "laine", linen: "lin", black: "noir", white: "blanc", blue: "bleu", green: "vert", red: "rouge", grey: "gris",
    drainage: "drainage", hole: "trou", indoors: "à l'intérieur", bring: "rentrer", below: "sous", wash: "laver", cold: "froid", dishwasher: "lave-vaisselle", safe: "compatible",
  },
};

function fakeTranslate(text: string, locale: string): string {
  const dict = DICTIONARY[locale];
  if (!dict) return text;
  // Split on HTML tags and protected sentinels so they pass through untouched.
  return text
    .split(/(<[^>]+>|⟦\d+⟧)/g)
    .map((part) => {
      if (/^<[^>]+>$/.test(part) || /^⟦\d+⟧$/.test(part)) return part;
      return part.replace(/[A-Za-z]+/g, (w) => {
        const t = dict[w.toLowerCase()];
        if (!t) return w;
        return w[0] === w[0]?.toUpperCase() ? t.charAt(0).toUpperCase() + t.slice(1) : t;
      });
    })
    .join("");
}

function translate(input: TranslateInput): AiTranslateBatch {
  return { items: input.items.map((it) => ({ id: it.id, text: fakeTranslate(it.text, input.locale) })) };
}
