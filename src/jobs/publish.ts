import { and, eq, notInArray } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db/client";
import { listPhotosForProducts } from "@/db/repositories/photos";
import { getVariants } from "@/db/repositories/products";
import { products, storefrontProducts, stores, translations, type ProductContent, type PublishedSnapshot, type PublishedVariant, type StorefrontImage } from "@/db/schema";
import { JobError } from "@/queue/errors";
import type { JobHandler } from "@/worker/loop";

type TranslatedField = "title" | "descriptionHtml" | "metaTitle" | "metaDescription";

/**
 * Approve = copy the draft into the published snapshot and rebuild the storefront rows for every
 * locale. The storefront reads only those rows (EC-H1, H2, H6). Translations that are fresh, or
 * manual (even if outdated), are used; everything else falls back to English per field.
 */
export async function publishProduct(db: DbOrTx, productId: string): Promise<boolean> {
  const [p] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!p || !p.draft || p.deletedAt) return false;
  const [store] = await db.select({ locales: stores.locales }).from(stores).where(eq(stores.id, p.storeId)).limit(1);
  if (!store) return false;
  const variantRows = await getVariants(db, productId);
  const photoRows = await listPhotosForProducts(db, [productId]);
  const images: StorefrontImage[] = photoRows.map((ph) => ({ id: ph.blobId, thumbId: ph.thumbBlobId, alt: p.draft?.title ?? p.handle }));

  const publishedVariants: PublishedVariant[] = variantRows.map((v) => ({
    sku: v.sku,
    options: v.options,
    priceCents: v.priceCents,
    currency: v.currency,
    compareAtCents: v.compareAtCents,
    weightGrams: v.weightGrams,
    dimensions: v.dimensions,
    imageIds: photoRows.filter((ph) => ph.variantId === v.id).map((ph) => ph.blobId),
  }));
  const snapshot: PublishedSnapshot = {
    ...p.draft,
    handle: p.handle,
    variants: publishedVariants,
    imageIds: images.map((i) => i.id),
    publishedAt: new Date().toISOString(),
    version: p.version,
  };
  await db.update(products).set({ published: snapshot, publishedAt: new Date(), updatedAt: new Date() }).where(eq(products.id, productId));
  await rebuildStorefrontRows(db, p.storeId, productId, p.handle, snapshot, store.locales);
  return true;
}

/** Rewrite storefront rows from the published snapshot plus current translations (also run after translation updates). */
export async function rebuildStorefrontRows(db: DbOrTx, storeId: string, productId: string, handle: string, snapshot: PublishedSnapshot, locales: string[]): Promise<void> {
  const trows = await db.select().from(translations).where(eq(translations.productId, productId));
  const priced = snapshot.variants.filter((v) => v.priceCents !== null);
  const currencies = new Set(priced.map((v) => v.currency));
  const priceFrom = priced.length ? Math.min(...priced.map((v) => v.priceCents as number)) : null;
  const currency = currencies.size === 1 ? (priced[0]?.currency ?? null) : null;
  const images: StorefrontImage[] = snapshot.imageIds.map((id) => ({ id, thumbId: id, alt: snapshot.title ?? handle }));

  for (const locale of locales) {
    const pick = (field: TranslatedField, english: string | null): { text: string | null; fallback: boolean } => {
      if (locale === "en" || !english) return { text: english, fallback: false };
      const t = trows.find((r) => r.locale === locale && r.field === field);
      if (t && t.text && (t.status === "fresh" || t.origin === "manual")) return { text: t.text, fallback: false };
      return { text: english, fallback: true };
    };
    const title = pick("title", snapshot.title);
    const desc = pick("descriptionHtml", snapshot.descriptionHtml);
    const metaTitle = pick("metaTitle", snapshot.seo.metaTitle);
    const metaDesc = pick("metaDescription", snapshot.seo.metaDescription);
    const fallbackFields = [title.fallback && "title", desc.fallback && "descriptionHtml", metaTitle.fallback && "metaTitle", metaDesc.fallback && "metaDescription"].filter((x): x is string => typeof x === "string");
    const attributes: Record<string, string> = { ...snapshot.attributes };
    for (const [k, v] of Object.entries(snapshot.attributes)) {
      const t = trows.find((r) => r.locale === locale && r.field === `attributes.${k}`);
      if (locale !== "en" && t?.text && (t.status === "fresh" || t.origin === "manual")) attributes[k] = t.text;
      else attributes[k] = v;
    }
    await db
      .insert(storefrontProducts)
      .values({
        productId,
        storeId,
        locale,
        handle,
        title: title.text ?? handle,
        descriptionHtml: desc.text,
        category: snapshot.category,
        tags: snapshot.tags,
        attributes,
        variants: snapshot.variants,
        images,
        priceFromCents: priceFrom,
        currency,
        seo: { metaTitle: metaTitle.text, metaDescription: metaDesc.text },
        fallbackFields,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [storefrontProducts.productId, storefrontProducts.locale],
        set: {
          handle,
          title: title.text ?? handle,
          descriptionHtml: desc.text,
          category: snapshot.category,
          tags: snapshot.tags,
          attributes,
          variants: snapshot.variants,
          images,
          priceFromCents: priceFrom,
          currency,
          seo: { metaTitle: metaTitle.text, metaDescription: metaDesc.text },
          fallbackFields,
          updatedAt: new Date(),
        },
      });
  }
  if (locales.length > 0) {
    await db.delete(storefrontProducts).where(and(eq(storefrontProducts.productId, productId), notInArray(storefrontProducts.locale, locales)));
  }
}

/** Remove a product from the storefront (reject, delete, archive) without touching the draft (EC-F2, H5). */
export async function unpublishProduct(db: DbOrTx, productId: string): Promise<void> {
  await db.delete(storefrontProducts).where(eq(storefrontProducts.productId, productId));
  await db.update(products).set({ published: null, publishedAt: null, updatedAt: new Date() }).where(eq(products.id, productId));
}

export async function republishIfLive(db: Db, productId: string): Promise<void> {
  const [p] = await db.select({ storeId: products.storeId, handle: products.handle, published: products.published, deletedAt: products.deletedAt }).from(products).where(eq(products.id, productId)).limit(1);
  if (!p?.published || p.deletedAt) return;
  const [store] = await db.select({ locales: stores.locales }).from(stores).where(eq(stores.id, p.storeId)).limit(1);
  if (!store) return;
  await rebuildStorefrontRows(db, p.storeId, productId, p.handle, p.published, store.locales);
}

export const publishHandler: JobHandler = async ({ job, db }) => {
  const productId = job.payload.productId as string | undefined;
  if (!productId) throw new JobError("publish job without productId", { retryable: false });
  await publishProduct(db, productId);
};

export function contentFields(content: ProductContent): Array<{ field: string; text: string; kind: "title" | "html" | "meta" | "plain" }> {
  const out: Array<{ field: string; text: string; kind: "title" | "html" | "meta" | "plain" }> = [];
  if (content.title) out.push({ field: "title", text: content.title, kind: "title" });
  if (content.descriptionHtml) out.push({ field: "descriptionHtml", text: content.descriptionHtml, kind: "html" });
  if (content.seo.metaTitle) out.push({ field: "metaTitle", text: content.seo.metaTitle, kind: "meta" });
  if (content.seo.metaDescription) out.push({ field: "metaDescription", text: content.seo.metaDescription, kind: "meta" });
  for (const [k, v] of Object.entries(content.attributes)) if (v && /[a-z]{3,}/i.test(v)) out.push({ field: `attributes.${k}`, text: v, kind: "plain" });
  return out;
}
