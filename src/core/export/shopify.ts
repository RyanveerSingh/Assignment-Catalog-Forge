import { centsToDecimal, csvLine } from "./csv";
import type { ExportProduct, ExportVariant } from "./types";

const COLUMNS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Product Category",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Option3 Name",
  "Option3 Value",
  "Variant SKU",
  "Variant Grams",
  "Variant Inventory Tracker",
  "Variant Inventory Qty",
  "Variant Inventory Policy",
  "Variant Fulfillment Service",
  "Variant Price",
  "Variant Compare At Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Variant Barcode",
  "Image Src",
  "Image Position",
  "Image Alt Text",
  "Gift Card",
  "SEO Title",
  "SEO Description",
  "Status",
] as const;

export const SHOPIFY_COLUMNS: ReadonlyArray<string> = COLUMNS;

type ShopifyColumn = (typeof COLUMNS)[number];
type ShopifyRow = Partial<Record<ShopifyColumn, unknown>>;

const OPTION_NAME_COLUMNS = ["Option1 Name", "Option2 Name", "Option3 Name"] as const;
const OPTION_VALUE_COLUMNS = ["Option1 Value", "Option2 Value", "Option3 Value"] as const;
/** Shopify products carry at most three options. */
const MAX_OPTIONS = OPTION_NAME_COLUMNS.length;

/** Shopify's placeholder option for products that have no real options. */
const DEFAULT_OPTION_NAME = "Title";
const DEFAULT_OPTION_VALUE = "Default Title";

function emit(row: ShopifyRow): string {
  return csvLine(COLUMNS.map((c) => row[c]));
}

/** Option keys in order of first appearance; keys that are empty on every variant are ignored. */
function optionKeys(variants: ReadonlyArray<ExportVariant>): string[] {
  const keys: string[] = [];
  for (const v of variants) {
    for (const [key, value] of Object.entries(v.options ?? {})) {
      if (typeof value === "string" && value.length > 0 && !keys.includes(key)) keys.push(key);
    }
  }
  return keys.slice(0, MAX_OPTIONS);
}

/** "size" → "Size", "shoe_size" → "Shoe Size". */
function optionLabel(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Shopify's free-text "Type" is a short label, so the leaf of the category path is used. */
function productType(category: string | null | undefined): string {
  if (!category) return "";
  const parts = category.split(">").map((s) => s.trim()).filter((s) => s.length > 0);
  return parts.length > 0 ? parts[parts.length - 1] : "";
}

function variantCells(
  v: ExportVariant | null,
  keys: ReadonlyArray<string>,
  siblingCount: number,
): ShopifyRow {
  const hasQuantity = v !== null && v.quantity !== null && v.quantity !== undefined;
  const row: ShopifyRow = {
    "Variant SKU": v?.sku ?? "",
    "Variant Grams": v?.weightGrams ?? "",
    "Variant Inventory Tracker": hasQuantity ? "shopify" : "",
    "Variant Inventory Qty": v?.quantity ?? "",
    "Variant Inventory Policy": "deny",
    "Variant Fulfillment Service": "manual",
    "Variant Price": centsToDecimal(v?.priceCents),
    "Variant Compare At Price": centsToDecimal(v?.compareAtCents),
    "Variant Requires Shipping": "TRUE",
    "Variant Taxable": "TRUE",
    "Variant Barcode": v?.barcode ?? "",
  };

  if (keys.length === 0) {
    // Shopify rejects two variants with the same option values, so siblings without options
    // are told apart by SKU; a lone variant keeps the conventional "Default Title".
    const fallback = siblingCount > 1 && v?.sku ? v.sku : DEFAULT_OPTION_VALUE;
    row["Option1 Value"] = fallback;
    return row;
  }
  keys.forEach((key, i) => {
    row[OPTION_VALUE_COLUMNS[i]] = v?.options?.[key] ?? "";
  });
  return row;
}

function* productRows(p: ExportProduct): Generator<string, void, unknown> {
  const handle = p.handle ?? "";
  const title = p.title ?? "";
  const variants = (p.variants ?? []).filter((v) => v != null);
  const keys = optionKeys(variants);
  const images = (p.imageUrls ?? []).filter((u) => typeof u === "string" && u.length > 0);
  const approved = p.status === "approved";

  const first: ShopifyRow = {
    Handle: handle,
    Title: title,
    "Body (HTML)": p.descriptionHtml ?? "",
    Vendor: p.vendor ?? "",
    "Product Category": p.category ?? "",
    Type: productType(p.category),
    Tags: (p.tags ?? []).join(", "),
    Published: approved ? "TRUE" : "FALSE",
    "Gift Card": "FALSE",
    "SEO Title": p.seo?.metaTitle ?? "",
    "SEO Description": p.seo?.metaDescription ?? "",
    Status: approved ? "active" : "draft",
  };
  if (keys.length === 0) {
    first["Option1 Name"] = DEFAULT_OPTION_NAME;
  } else {
    keys.forEach((key, i) => {
      first[OPTION_NAME_COLUMNS[i]] = optionLabel(key);
    });
  }
  if (images.length > 0) {
    first["Image Src"] = images[0];
    first["Image Position"] = 1;
    first["Image Alt Text"] = title;
  }

  // A product with no variants still needs one row, or Shopify never sees it.
  const rows: ReadonlyArray<ExportVariant | null> = variants.length === 0 ? [null] : variants;
  for (let i = 0; i < rows.length; i++) {
    const row: ShopifyRow = i === 0 ? first : { Handle: handle };
    yield emit({ ...row, ...variantCells(rows[i], keys, variants.length) });
  }

  for (let i = 1; i < images.length; i++) {
    yield emit({ Handle: handle, "Image Src": images[i], "Image Position": i + 1 });
  }
}

/**
 * Shopify product CSV (EC-J8): the first row of a handle carries the product fields, later
 * rows of the same handle carry only option values and variant fields, and extra images get
 * rows of their own. Streams one line per chunk (EC-J7) and inherits the EC-I6 formula guard.
 */
export function* streamShopifyCsv(products: Iterable<ExportProduct>): Generator<string, void, unknown> {
  yield csvLine(COLUMNS);
  for (const p of products) {
    if (p == null) continue;
    yield* productRows(p);
  }
}
