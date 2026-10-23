import { cachedProducts, cachedStore } from "@/app/store/[slug]/storefront-context";
import { storefrontImageUrl } from "@/components/storefront/image-url";
import { formatMoney } from "@/core/i18n/locale";
import { getLogger } from "@/lib/logger";
import type { ShopTile } from "./hero-listing";

export const DEMO_SLUG = "demo";

export interface DemoShop {
  total: number;
  tiles: ShopTile[];
}

/**
 * The demo store's published products with a photo, through the storefront's own 30 s cache. The
 * landing must still render when the database is down, so a failure yields an empty shop rather
 * than an error page.
 */
export async function loadDemoShop(): Promise<DemoShop> {
  try {
    const store = await cachedStore(DEMO_SLUG);
    if (!store) return { total: 0, tiles: [] };
    const { items, total } = await cachedProducts(store.id, "en", { page: 1, sort: "newest" });
    const tiles = items.flatMap((p): ShopTile[] => {
      const img = p.images[0];
      if (!img) return [];
      const price = p.priceFromCents !== null && p.currency ? formatMoney(p.priceFromCents, p.currency, "en") : "Price on request";
      return [{ href: `/store/${DEMO_SLUG}/p/${p.handle}`, title: p.title, price, src: storefrontImageUrl(DEMO_SLUG, img.id) }];
    });
    return { total, tiles };
  } catch (err) {
    getLogger().warn({ err }, "landing: demo shop unavailable");
    return { total: 0, tiles: [] };
  }
}
