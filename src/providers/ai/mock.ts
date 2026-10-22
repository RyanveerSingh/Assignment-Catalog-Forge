import { CLAIM_LEXICON } from "@/core/ai/lexicon";
import type { EnrichInput, EnrichProductInput, TranslateInput } from "@/core/ai/prompts";
import type { AiEnrichBatch, AiProductOutput, AiTranslateBatch } from "@/core/ai/schema";
import { TAXONOMY, TAXONOMY_FALLBACK } from "@/core/ai/taxonomy";
import { AiError } from "./errors";
import type { AiBatchHandle, AiBatchResult, AiProvider, AiRequest, AiResponse, AiUsage } from "./types";

/**
 * Demo-mode provider: a deterministic, rule-based stand-in so the whole pipeline runs with no API key.
 * It is intentionally naive about negation (it will claim "frost-proof" when the source says
 * "not frost-proof") so that the grounding validator has something real to catch in demos (EC-D2, B15).
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
    const usage: AiUsage = {
      inputTokens: Math.ceil((req.system.length + req.userText.length) / 4),
      outputTokens: Math.ceil(rawText.length / 4),
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    await new Promise((r) => setTimeout(r, 30 + Math.min(200, req.userText.length / 200)));
    return { output: parsed.data, rawText, usage, model: req.model, latencyMs: Date.now() - started, stopReason: "end_turn", costMicros: 0, batched: false };
  }

  return {
    name: "mock",
    complete: run,
    async createBatch<T>(reqs: Array<AiRequest<T> & { customId: string }>): Promise<AiBatchHandle> {
      const id = `mock-batch-${++batchSeq}`;
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

const CATEGORY_KEYWORDS: Array<[RegExp, string]> = [
  [/\b(planter|plant pot|übertopf|ubertopf|blumentopf|cache[- ]?pot|jardini[eè]re)\b/i, "Home & Garden > Decor > Planters"],
  [/\b(mug|cup|tasse|becher)\b/i, "Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs"],
  [/\b(tumbler|glass|glas|verre)\b/i, "Home & Garden > Kitchen & Dining > Tableware > Drinkware > Tumblers"],
  [/\b(water bottle|trinkflasche|gourde)\b/i, "Home & Garden > Kitchen & Dining > Tableware > Drinkware > Water Bottles"],
  [/\b(cushion|pillow|kissen|coussin)\b/i, "Home & Garden > Decor > Throw Pillows"],
  [/\b(candle holder|kerzenhalter|bougeoir)\b/i, "Home & Garden > Decor > Candle Holders"],
  [/\b(candle|kerze|bougie)\b/i, "Home & Garden > Decor > Candles"],
  [/\b(vase)\b/i, "Home & Garden > Decor > Vases"],
  [/\b(basket|korb|panier)\b/i, "Home & Garden > Decor > Baskets"],
  [/\b(rug|teppich|tapis)\b/i, "Home & Garden > Decor > Rugs"],
  [/\b(mirror|spiegel|miroir)\b/i, "Home & Garden > Decor > Mirrors"],
  [/\b(frame|bilderrahmen|cadre)\b/i, "Home & Garden > Decor > Picture Frames"],
  [/\b(clock|uhr|horloge)\b/i, "Home & Garden > Decor > Clocks"],
  [/\b(bath towel|badetuch|serviette de bain)\b/i, "Home & Garden > Linens & Bedding > Towels > Bath Towels"],
  [/\b(tea towel|kitchen towel|geschirrtuch|torchon)\b/i, "Home & Garden > Linens & Bedding > Towels > Kitchen Towels"],
  [/\b(blanket|throw|decke|plaid|couverture)\b/i, "Home & Garden > Linens & Bedding > Bedding > Blankets"],
  [/\b(duvet cover|bettbezug|housse de couette)\b/i, "Home & Garden > Linens & Bedding > Bedding > Duvet Covers"],
  [/\b(apron|schürze|schurze|tablier)\b/i, "Home & Garden > Linens & Bedding > Kitchen Linens > Aprons"],
  [/\b(oven mitt|pot holder|topflappen|manique)\b/i, "Home & Garden > Linens & Bedding > Kitchen Linens > Oven Mitts & Pot Holders"],
  [/\b(table lamp|tischlampe|lampe de table)\b/i, "Home & Garden > Lighting > Lamps > Table Lamps"],
  [/\b(floor lamp|stehlampe|lampadaire)\b/i, "Home & Garden > Lighting > Lamps > Floor Lamps"],
  [/\b(pendant|hängeleuchte|suspension)\b/i, "Home & Garden > Lighting > Lighting Fixtures > Pendant Lights"],
  [/\b(string lights|lichterkette|guirlande)\b/i, "Home & Garden > Lighting > String Lights"],
  [/\b(lamp|leuchte|lampe)\b/i, "Home & Garden > Lighting > Lamps > Table Lamps"],
  [/\b(dining chair|esszimmerstuhl|chaise de salle)\b/i, "Furniture > Chairs > Dining Chairs"],
  [/\b(armchair|sessel|fauteuil)\b/i, "Furniture > Chairs > Armchairs"],
  [/\b(stool|hocker|tabouret)\b/i, "Furniture > Chairs > Stools"],
  [/\b(chair|stuhl|chaise)\b/i, "Furniture > Chairs > Dining Chairs"],
  [/\b(coffee table|couchtisch|table basse)\b/i, "Furniture > Tables > Coffee Tables"],
  [/\b(side table|beistelltisch|table d'appoint)\b/i, "Furniture > Tables > Side Tables"],
  [/\b(desk|schreibtisch|bureau)\b/i, "Furniture > Tables > Desks"],
  [/\b(table|tisch)\b/i, "Furniture > Tables > Dining Tables"],
  [/\b(shelf|shelving|regal|étagère|etagere)\b/i, "Furniture > Cabinets & Storage > Shelving"],
  [/\b(bowl|schüssel|schussel|schale|bol)\b/i, "Home & Garden > Kitchen & Dining > Tableware > Dinnerware > Bowls"],
  [/\b(plate|teller|assiette)\b/i, "Home & Garden > Kitchen & Dining > Tableware > Dinnerware > Plates"],
  [/\b(teapot|teekanne|théière|theiere)\b/i, "Home & Garden > Kitchen & Dining > Tableware > Serveware > Teapots"],
  [/\b(platter|servierplatte|plateau)\b/i, "Home & Garden > Kitchen & Dining > Tableware > Serveware > Serving Platters"],
  [/\b(cutting board|chopping board|schneidebrett|planche à découper)\b/i, "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Cutting Boards"],
  [/\b(knife|knives|messer|couteau)\b/i, "Home & Garden > Kitchen & Dining > Cutlery > Knives"],
  [/\b(spatula|whisk|ladle|utensil|kochlöffel|pfannenwender|spatule)\b/i, "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Cooking Utensils"],
  [/\b(grater|peeler|reibe|sparschäler|râpe|éplucheur)\b/i, "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Graters & Peelers"],
  [/\b(skillet|saucepan|frying pan|stockpot|dutch oven|pot|topf|pfanne|bratpfanne|casserole|poêle|cocotte)\b/i, "Home & Garden > Kitchen & Dining > Cookware > Pots & Pans"],
  [/\b(baking dish|auflaufform|plat à gratin)\b/i, "Home & Garden > Kitchen & Dining > Cookware > Baking Dishes"],
  [/\b(food container|storage jar|vorratsdose|vorratsglas|boîte de conservation|bocal)\b/i, "Home & Garden > Kitchen & Dining > Food Storage > Food Containers"],
  [/\b(lunch box|brotdose|boîte à lunch)\b/i, "Home & Garden > Kitchen & Dining > Food Storage > Lunch Boxes"],
  [/\b(napkin|serviette|serviettes)\b/i, "Home & Garden > Kitchen & Dining > Tableware > Table Linens > Napkins"],
  [/\b(placemat|tischset|set de table)\b/i, "Home & Garden > Kitchen & Dining > Tableware > Table Linens > Placemats"],
  [/\b(tablecloth|tischdecke|nappe)\b/i, "Home & Garden > Kitchen & Dining > Tableware > Table Linens > Tablecloths"],
  [/\b(trowel|handschaufel|transplantoir)\b/i, "Home & Garden > Lawn & Garden > Gardening > Gardening Tools > Hand Trowels"],
  [/\b(pruner|pruning shears|secateurs|gartenschere|sécateur)\b/i, "Home & Garden > Lawn & Garden > Gardening > Gardening Tools > Pruning Shears"],
  [/\b(rake|rechen|harke|râteau)\b/i, "Home & Garden > Lawn & Garden > Gardening > Gardening Tools > Rakes"],
  [/\b(watering can|gießkanne|giesskanne|arrosoir)\b/i, "Home & Garden > Lawn & Garden > Gardening > Gardening Tools > Watering Cans"],
  [/\b(garden gloves|gartenhandschuhe|gants de jardin)\b/i, "Home & Garden > Lawn & Garden > Gardening > Gardening Gloves"],
  [/\b(seeds?|samen|graines)\b/i, "Home & Garden > Lawn & Garden > Gardening > Seeds & Bulbs"],
  [/\b(soap dish|seifenschale|porte-savon)\b/i, "Home & Garden > Bathroom Accessories > Soap Dishes & Dispensers"],
  [/\b(bath mat|badematte|tapis de bain)\b/i, "Home & Garden > Bathroom Accessories > Bath Mats & Rugs"],
  [/\b(toothbrush holder|zahnbürstenhalter|porte-brosse)\b/i, "Home & Garden > Bathroom Accessories > Toothbrush Holders"],
  [/\b(towel rack|towel holder|handtuchhalter|porte-serviette)\b/i, "Home & Garden > Bathroom Accessories > Towel Racks & Holders"],
  [/\b(soap|seife|savon)\b/i, "Health & Beauty > Personal Care > Bath & Body > Bar Soap"],
  [/\b(lotion|body cream|körperlotion|crème corps)\b/i, "Health & Beauty > Personal Care > Bath & Body > Body Lotion"],
  [/\b(dog)\b/i, "Animals & Pet Supplies > Pet Supplies > Dog Supplies"],
  [/\b(cat|katze|chat)\b/i, "Animals & Pet Supplies > Pet Supplies > Cat Supplies"],
  [/\b(pet bed|hundebett|katzenbett|panier pour chien)\b/i, "Animals & Pet Supplies > Pet Supplies > Pet Beds"],
  [/\b(pet bowl|napf|gamelle)\b/i, "Animals & Pet Supplies > Pet Supplies > Pet Bowls & Feeders"],
  [/\b(pet toy|hundespielzeug|jouet pour chien)\b/i, "Animals & Pet Supplies > Pet Supplies > Pet Toys"],
  [/\b(puzzle)\b/i, "Toys & Games > Games > Puzzles"],
  [/\b(board game|brettspiel|jeu de société)\b/i, "Toys & Games > Games > Board Games"],
  [/\b(wooden toy|holzspielzeug|jouet en bois)\b/i, "Toys & Games > Toys > Wooden Toys"],
  [/\b(plush|stuffed|kuscheltier|peluche|doll|puppe|poupée)\b/i, "Toys & Games > Toys > Dolls & Stuffed Animals"],
  [/\b(building blocks|bauklötze|blocs de construction)\b/i, "Toys & Games > Toys > Building Toys"],
  [/\b(toy|spielzeug|jouet)\b/i, "Toys & Games > Toys > Educational Toys"],
  [/\b(notebook|notizbuch|cahier|notepad)\b/i, "Office Supplies > General Office Supplies > Paper > Notebooks & Notepads"],
  [/\b(pen|kugelschreiber|stylo)\b/i, "Office Supplies > Writing Instruments > Pens"],
  [/\b(pencil|bleistift|crayon)\b/i, "Office Supplies > Writing Instruments > Pencils"],
  [/\b(pen holder|stiftehalter|pot à crayons)\b/i, "Office Supplies > Desk Accessories > Pen Holders"],
  [/\b(yoga mat|yogamatte|tapis de yoga)\b/i, "Sporting Goods > Exercise & Fitness > Yoga & Pilates > Yoga Mats"],
  [/\b(backpack|rucksack|sac à dos)\b/i, "Luggage & Bags > Backpacks"],
  [/\b(tote|einkaufstasche|cabas)\b/i, "Luggage & Bags > Shopping Totes"],
  [/\b(scarf|schal|écharpe)\b/i, "Apparel & Accessories > Clothing Accessories > Scarves & Shawls"],
  [/\b(hat|beanie|mütze|bonnet)\b/i, "Apparel & Accessories > Clothing Accessories > Hats"],
  [/\b(gloves|handschuhe|gants)\b/i, "Apparel & Accessories > Clothing Accessories > Gloves & Mittens"],
  [/\b(t-shirt|shirt|top|bluse|chemise)\b/i, "Apparel & Accessories > Clothing > Shirts & Tops"],
  [/\b(earrings?|ohrringe|boucles)\b/i, "Apparel & Accessories > Jewelry > Earrings"],
  [/\b(necklace|kette|collier)\b/i, "Apparel & Accessories > Jewelry > Necklaces"],
  [/\b(bracelet|armband)\b/i, "Apparel & Accessories > Jewelry > Bracelets"],
  [/\b(ring)\b/i, "Apparel & Accessories > Jewelry > Rings"],
  [/\b(headphones|kopfhörer|casque)\b/i, "Electronics > Audio > Headphones"],
  [/\b(speaker|lautsprecher|enceinte)\b/i, "Electronics > Audio > Speakers"],
  [/\b(cable|kabel|câble)\b/i, "Electronics > Electronics Accessories > Cables"],
  [/\b(charger|ladegerät|chargeur)\b/i, "Electronics > Electronics Accessories > Chargers & Power Adapters"],
  [/\b(phone case|handyhülle|coque)\b/i, "Electronics > Electronics Accessories > Phone Cases"],
  [/\b(coffee|kaffee|café)\b/i, "Food, Beverages & Tobacco > Beverages > Coffee"],
  [/\b(tea|tee|thé)\b/i, "Food, Beverages & Tobacco > Beverages > Tea"],
  [/\b(chocolate|schokolade|chocolat)\b/i, "Food, Beverages & Tobacco > Food Items > Candy & Chocolate"],
  [/\b(storage box|bin|aufbewahrungsbox|boîte de rangement)\b/i, "Home & Garden > Household Supplies > Storage & Organization > Storage Boxes & Bins"],
  [/\b(hook|haken|crochet)\b/i, "Home & Garden > Household Supplies > Storage & Organization > Hooks & Hangers"],
  [/\b(hammer)\b/i, "Hardware > Tools > Hand Tools > Hammers"],
  [/\b(screwdriver|schraubendreher|tournevis)\b/i, "Hardware > Tools > Hand Tools > Screwdrivers"],
  [/\b(wrench|spanner|schraubenschlüssel|clé)\b/i, "Hardware > Tools > Hand Tools > Wrenches"],
  [/\b(tape measure|maßband|mètre)\b/i, "Hardware > Tools > Measuring Tools"],
  [/\b(drill|bohrer|perceuse)\b/i, "Hardware > Tools > Power Tools"],
];

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
  return { title: titleCase(raw), confidence: 95, reason: null };
}

function deriveCategory(p: EnrichProductInput, title: string): { category: string; confidence: number; reason: string | null } {
  // The title names the product; the description only disambiguates, so it is searched second.
  const titleHay = `${title} ${p.category_hint ?? ""}`.toLowerCase();
  for (const [re, path] of CATEGORY_KEYWORDS) {
    if (re.test(titleHay)) return { category: path, confidence: 88, reason: null };
  }
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
        if (hit) {
          seen.add(entry.term);
          const idx = fold(value).indexOf(hit);
          const quote = idx >= 0 ? value.slice(Math.max(0, idx - 10), Math.min(value.length, idx + hit.length + 25)).trim() : value.slice(0, 60);
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
