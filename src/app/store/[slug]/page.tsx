import type { Metadata } from "next";
import { leafLabel } from "@/components/storefront/categories";
import { storeHref } from "@/components/storefront/hrefs";
import { t } from "@/components/storefront/i18n";
import { Collection } from "./collection";
import { firstParam, loadStorefront, parsePage, parseSort } from "./storefront-context";

// Reads the country cookie, so it can never be statically rendered; the data behind it is cached for 30 s (EC-H6).
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const category = firstParam(sp.category);
  const ctx = await loadStorefront(slug);
  return { title: category ? leafLabel(category) : t(ctx.locale, "allProducts") };
}

export default async function StorePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const sp = await searchParams;
  const category = firstParam(sp.category)?.trim() || undefined;
  return <Collection slug={slug} basePath={storeHref(slug)} category={category} categoryInQuery page={parsePage(firstParam(sp.page))} sort={parseSort(firstParam(sp.sort))} />;
}
