import { foldForMatch } from "@/core/clean/text";

/** Nearest taxonomy path by trigram similarity, else a unique leaf-name match ("Planters"), else null (EC-D3). */
export function nearestTaxonomyPath(category: string): string | null {
  const target = foldForMatch(category);
  let best: { path: string; score: number } | null = null;
  for (const path of TAXONOMY) {
    const score = jaccardTrigrams(target, foldForMatch(path));
    if (!best || score > best.score) best = { path, score };
  }
  if (best && best.score >= 0.5) return best.path;
  const leaf = foldForMatch(category.split(">").pop() ?? category);
  const leafMatches = TAXONOMY.filter((p) => foldForMatch(p.split(" > ").pop() ?? "") === leaf);
  return leafMatches.length === 1 ? (leafMatches[0] ?? null) : null;
}

function jaccardTrigrams(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / (ta.size + tb.size - inter);
}

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
}

/** German and French words for the taxonomy's own node names, so a supplier's category column can be snapped. */
const CATEGORY_WORDS: ReadonlyArray<[RegExp, string]> = [
  [/\b(haus|maison)\b/g, "home"],
  [/\b(garten|jardin|jardinage)\b/g, "garden"],
  [/\b(kuche|cuisine)\b/g, "kitchen"],
  [/\b(essen|salle a manger|esszimmer)\b/g, "dining"],
  [/\b(dekoration|deko|decoration)\b/g, "decor"],
  [/\b(beleuchtung|eclairage|luminaires)\b/g, "lighting"],
  [/\b(lampen|lampe|lampes)\b/g, "lamps"],
  [/\b(mobel|meubles|meuble)\b/g, "furniture"],
  [/\b(buro|bureau|burobedarf|fournitures de bureau)\b/g, "office supplies"],
  [/\b(spielzeug|spielwaren|jouets|jouet)\b/g, "toys"],
  [/\b(spiele|jeux)\b/g, "games"],
  [/\b(tiere|haustiere|haustier|animaux|animalerie)\b/g, "pet supplies"],
  [/\b(bad|badezimmer|salle de bain|salle de bains)\b/g, "bathroom accessories"],
  [/\b(kerzen|kerze|bougies|bougie)\b/g, "candles"],
  [/\b(teppiche|teppich|tapis)\b/g, "rugs"],
  [/\b(vaisselle|geschirr|arts de la table)\b/g, "tableware"],
  [/\b(kochgeschirr|ustensiles de cuisine)\b/g, "cookware"],
  [/\b(bettwasche|linge de lit|literie)\b/g, "bedding"],
  [/\b(handtucher|serviettes)\b/g, "towels"],
  [/\b(kissen|coussins|coussin)\b/g, "throw pillows"],
  [/\b(pflanzgefasse|blumentopfe|ubertopfe|jardinieres|pots de fleurs)\b/g, "planters"],
  [/\b(gartengerate|outils de jardin)\b/g, "gardening tools"],
  [/\b(giesskannen|arrosoirs)\b/g, "watering cans"],
  [/\b(schreibwaren|papeterie)\b/g, "paper"],
  [/\b(fournitures generales|allgemeiner burobedarf)\b/g, "general office supplies"],
  [/\b(carnets|carnet|notizbucher|notizbuch|notizblocke)\b/g, "notebooks notepads"],
  [/\b(stifte|stylos|schreibgerate|instruments d ecriture)\b/g, "writing instruments"],
  [/\b(regale|etageres)\b/g, "shelving"],
  [/\b(tische|tables)\b/g, "tables"],
  [/\b(stuhle|chaises)\b/g, "chairs"],
];

/** "Haus & Garten > Dekoration > Kerzen" → "home garden decor candles": a hint the snapper can score. */
export function anglicizeCategoryHint(hint: string): string {
  let text = foldForMatch(hint);
  for (const [re, en] of CATEGORY_WORDS) text = text.replace(re, en);
  return text;
}

/**
 * The supplier's category cell as a taxonomy node: the exact path, a parent node ("Furniture > Tables"),
 * or the nearest path cut back to the cell's own depth (a French three-level cell never claims a leaf
 * it did not name). Null when the cell is junk the snapper cannot place.
 */
export function resolveSourceCategory(raw: string): string | null {
  const text = raw
    .replace(/\s*[>/»|]+\s*/g, " > ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  const exact = TAXONOMY.find((p) => p.toLowerCase() === lower);
  if (exact) return exact;
  const parent = TAXONOMY.find((p) => p.toLowerCase().startsWith(`${lower} > `));
  if (parent) return parent.slice(0, text.length);
  const nearest = nearestTaxonomyPath(anglicizeCategoryHint(text));
  if (!nearest) return null;
  const segments = text.split(" > ");
  const leaf = nearest.split(" > ").pop() ?? "";
  // The cell's last segment names the leaf itself ("Gießkannen" → "Watering Cans"): keep the whole path.
  if (anglicizeCategoryHint(segments[segments.length - 1] ?? "") === foldForMatch(leaf)) return nearest;
  return nearest.split(" > ").slice(0, segments.length).join(" > ");
}

/**
 * A trimmed, Google-Product-Taxonomy-style category tree for physical goods.
 * The model must pick a path from this list; anything else is snapped to the nearest path or sent
 * to review (EC-D3). Kept small enough to live in the cached system prompt.
 */
export const TAXONOMY: ReadonlyArray<string> = [
  "Animals & Pet Supplies > Pet Supplies > Cat Supplies",
  "Animals & Pet Supplies > Pet Supplies > Dog Supplies",
  "Animals & Pet Supplies > Pet Supplies > Pet Beds",
  "Animals & Pet Supplies > Pet Supplies > Pet Bowls & Feeders",
  "Animals & Pet Supplies > Pet Supplies > Pet Toys",
  "Apparel & Accessories > Clothing > Activewear",
  "Apparel & Accessories > Clothing > Outerwear",
  "Apparel & Accessories > Clothing > Shirts & Tops",
  "Apparel & Accessories > Clothing > Dresses",
  "Apparel & Accessories > Clothing > Pants",
  "Apparel & Accessories > Clothing > Sleepwear & Loungewear",
  "Apparel & Accessories > Clothing Accessories > Hats",
  "Apparel & Accessories > Clothing Accessories > Scarves & Shawls",
  "Apparel & Accessories > Clothing Accessories > Gloves & Mittens",
  "Apparel & Accessories > Handbags, Wallets & Cases > Handbags",
  "Apparel & Accessories > Handbags, Wallets & Cases > Wallets & Money Clips",
  "Apparel & Accessories > Jewelry > Bracelets",
  "Apparel & Accessories > Jewelry > Earrings",
  "Apparel & Accessories > Jewelry > Necklaces",
  "Apparel & Accessories > Jewelry > Rings",
  "Apparel & Accessories > Shoes",
  "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials",
  "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Craft Kits",
  "Arts & Entertainment > Hobbies & Creative Arts > Musical Instruments",
  "Baby & Toddler > Baby Bathing",
  "Baby & Toddler > Baby Toys & Activity Equipment",
  "Baby & Toddler > Nursing & Feeding",
  "Baby & Toddler > Baby Transport",
  "Business & Industrial > Retail > Display & Fixtures",
  "Cameras & Optics > Camera & Optic Accessories",
  "Electronics > Audio > Headphones",
  "Electronics > Audio > Speakers",
  "Electronics > Computers > Computer Accessories",
  "Electronics > Electronics Accessories > Cables",
  "Electronics > Electronics Accessories > Chargers & Power Adapters",
  "Electronics > Electronics Accessories > Phone Cases",
  "Food, Beverages & Tobacco > Beverages > Coffee",
  "Food, Beverages & Tobacco > Beverages > Tea",
  "Food, Beverages & Tobacco > Food Items > Condiments & Sauces",
  "Food, Beverages & Tobacco > Food Items > Snack Foods",
  "Food, Beverages & Tobacco > Food Items > Candy & Chocolate",
  "Furniture > Beds & Accessories",
  "Furniture > Benches",
  "Furniture > Cabinets & Storage > Bookcases",
  "Furniture > Cabinets & Storage > Dressers",
  "Furniture > Cabinets & Storage > Shelving",
  "Furniture > Chairs > Armchairs",
  "Furniture > Chairs > Dining Chairs",
  "Furniture > Chairs > Office Chairs",
  "Furniture > Chairs > Stools",
  "Furniture > Outdoor Furniture",
  "Furniture > Shelving",
  "Furniture > Sofas",
  "Furniture > Tables > Coffee Tables",
  "Furniture > Tables > Dining Tables",
  "Furniture > Tables > Desks",
  "Furniture > Tables > Side Tables",
  "Hardware > Tools > Hand Tools > Hammers",
  "Hardware > Tools > Hand Tools > Screwdrivers",
  "Hardware > Tools > Hand Tools > Wrenches",
  "Hardware > Tools > Measuring Tools",
  "Hardware > Tools > Power Tools",
  "Hardware > Tool Storage & Organization",
  "Health & Beauty > Personal Care > Bath & Body > Bath Sponges & Loofahs",
  "Health & Beauty > Personal Care > Bath & Body > Bar Soap",
  "Health & Beauty > Personal Care > Bath & Body > Body Lotion",
  "Health & Beauty > Personal Care > Cosmetics > Skin Care",
  "Health & Beauty > Personal Care > Hair Care",
  "Health & Beauty > Personal Care > Oral Care",
  "Home & Garden > Bathroom Accessories > Bath Mats & Rugs",
  "Home & Garden > Bathroom Accessories > Soap Dishes & Dispensers",
  "Home & Garden > Bathroom Accessories > Toothbrush Holders",
  "Home & Garden > Bathroom Accessories > Towel Racks & Holders",
  "Home & Garden > Decor > Artificial Plants",
  "Home & Garden > Decor > Baskets",
  "Home & Garden > Decor > Candles",
  "Home & Garden > Decor > Candle Holders",
  "Home & Garden > Decor > Clocks",
  "Home & Garden > Decor > Decorative Bowls",
  "Home & Garden > Decor > Decorative Trays",
  "Home & Garden > Decor > Figurines",
  "Home & Garden > Decor > Mirrors",
  "Home & Garden > Decor > Picture Frames",
  "Home & Garden > Decor > Planters",
  "Home & Garden > Decor > Rugs",
  "Home & Garden > Decor > Throw Pillows",
  "Home & Garden > Decor > Vases",
  "Home & Garden > Decor > Wall Art",
  "Home & Garden > Decor > Window Treatments > Curtains & Drapes",
  "Home & Garden > Household Supplies > Laundry Supplies",
  "Home & Garden > Household Supplies > Storage & Organization > Storage Boxes & Bins",
  "Home & Garden > Household Supplies > Storage & Organization > Hooks & Hangers",
  "Home & Garden > Household Supplies > Trash Cans & Wastebaskets",
  "Home & Garden > Kitchen & Dining > Barware",
  "Home & Garden > Kitchen & Dining > Cookware > Pots & Pans",
  "Home & Garden > Kitchen & Dining > Cookware > Baking Dishes",
  "Home & Garden > Kitchen & Dining > Cutlery > Knives",
  "Home & Garden > Kitchen & Dining > Cutlery > Flatware",
  "Home & Garden > Kitchen & Dining > Food Storage > Food Containers",
  "Home & Garden > Kitchen & Dining > Food Storage > Lunch Boxes",
  "Home & Garden > Kitchen & Dining > Kitchen Appliances",
  "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Cutting Boards",
  "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Cooking Utensils",
  "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Graters & Peelers",
  "Home & Garden > Kitchen & Dining > Kitchen Tools & Utensils > Measuring Cups & Spoons",
  "Home & Garden > Kitchen & Dining > Tableware > Coffee & Tea Sets",
  "Home & Garden > Kitchen & Dining > Tableware > Dinnerware > Plates",
  "Home & Garden > Kitchen & Dining > Tableware > Dinnerware > Bowls",
  "Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs",
  "Home & Garden > Kitchen & Dining > Tableware > Drinkware > Tumblers",
  "Home & Garden > Kitchen & Dining > Tableware > Drinkware > Wine Glasses",
  "Home & Garden > Kitchen & Dining > Tableware > Drinkware > Water Bottles",
  "Home & Garden > Kitchen & Dining > Tableware > Serveware > Serving Bowls",
  "Home & Garden > Kitchen & Dining > Tableware > Serveware > Serving Platters",
  "Home & Garden > Kitchen & Dining > Tableware > Serveware > Teapots",
  "Home & Garden > Kitchen & Dining > Tableware > Table Linens > Napkins",
  "Home & Garden > Kitchen & Dining > Tableware > Table Linens > Placemats",
  "Home & Garden > Kitchen & Dining > Tableware > Table Linens > Tablecloths",
  "Home & Garden > Lawn & Garden > Gardening > Gardening Tools > Hand Trowels",
  "Home & Garden > Lawn & Garden > Gardening > Gardening Tools > Pruning Shears",
  "Home & Garden > Lawn & Garden > Gardening > Gardening Tools > Rakes",
  "Home & Garden > Lawn & Garden > Gardening > Gardening Tools > Watering Cans",
  "Home & Garden > Lawn & Garden > Gardening > Gardening Gloves",
  "Home & Garden > Lawn & Garden > Gardening > Pots & Planters",
  "Home & Garden > Lawn & Garden > Gardening > Seeds & Bulbs",
  "Home & Garden > Lawn & Garden > Outdoor Living > Garden Lighting",
  "Home & Garden > Lawn & Garden > Outdoor Living > Hammocks",
  "Home & Garden > Lawn & Garden > Outdoor Living > Outdoor Blankets",
  "Home & Garden > Lighting > Lamps > Desk Lamps",
  "Home & Garden > Lighting > Lamps > Floor Lamps",
  "Home & Garden > Lighting > Lamps > Table Lamps",
  "Home & Garden > Lighting > Light Bulbs",
  "Home & Garden > Lighting > Lighting Fixtures > Pendant Lights",
  "Home & Garden > Lighting > String Lights",
  "Home & Garden > Linens & Bedding > Bedding > Blankets",
  "Home & Garden > Linens & Bedding > Bedding > Duvet Covers",
  "Home & Garden > Linens & Bedding > Bedding > Pillowcases",
  "Home & Garden > Linens & Bedding > Bedding > Sheets",
  "Home & Garden > Linens & Bedding > Towels > Bath Towels",
  "Home & Garden > Linens & Bedding > Towels > Kitchen Towels",
  "Home & Garden > Linens & Bedding > Kitchen Linens > Aprons",
  "Home & Garden > Linens & Bedding > Kitchen Linens > Oven Mitts & Pot Holders",
  "Luggage & Bags > Backpacks",
  "Luggage & Bags > Shopping Totes",
  "Luggage & Bags > Suitcases",
  "Media > Books",
  "Office Supplies > Desk Accessories > Pen Holders",
  "Office Supplies > General Office Supplies > Paper > Notebooks & Notepads",
  "Office Supplies > Writing Instruments > Pens",
  "Office Supplies > Writing Instruments > Pencils",
  "Office Supplies > Filing & Organization",
  "Sporting Goods > Exercise & Fitness > Yoga & Pilates > Yoga Mats",
  "Sporting Goods > Exercise & Fitness > Weights",
  "Sporting Goods > Outdoor Recreation > Camping & Hiking > Camping Cookware",
  "Sporting Goods > Outdoor Recreation > Camping & Hiking > Sleeping Bags",
  "Sporting Goods > Outdoor Recreation > Cycling > Bicycle Accessories",
  "Toys & Games > Games > Board Games",
  "Toys & Games > Games > Puzzles",
  "Toys & Games > Toys > Building Toys",
  "Toys & Games > Toys > Dolls & Stuffed Animals",
  "Toys & Games > Toys > Educational Toys",
  "Toys & Games > Toys > Outdoor Toys",
  "Toys & Games > Toys > Wooden Toys",
  "Vehicles & Parts > Vehicle Parts & Accessories > Vehicle Maintenance & Care",
];

export const TAXONOMY_FALLBACK = "Home & Garden > Decor";
