import type { Metadata } from "next";
import { leafLabel } from "@/components/storefront/categories";
import { categoryHref } from "@/components/storefront/hrefs";
import { Collection } from "../../collection";
import { firstParam, parsePage, parseSort } from "../../storefront-context";

export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string; category: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

function decodeCategory(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { category } = await params;
  return { title: leafLabel(decodeCategory(category)) };
}

/** Category prefix match: "Home" also lists "Home > Kitchen" because the repository filters with `like 'Home%'`. */
export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug, category: raw } = await params;
  const sp = await searchParams;
  const category = decodeCategory(raw);
  return <Collection slug={slug} basePath={categoryHref(slug, category)} category={category} categoryInQuery={false} page={parsePage(firstParam(sp.page))} sort={parseSort(firstParam(sp.sort))} />;
}
