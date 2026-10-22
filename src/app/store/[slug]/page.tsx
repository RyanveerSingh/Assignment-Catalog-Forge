import type { Metadata } from "next";
import { Collection } from "./collection";
import { firstParam, parsePage, parseSort } from "./storefront-context";

// Reads the country cookie, so it can never be statically rendered; the data behind it is cached for 30 s (EC-H6).
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const sp = await searchParams;
  const category = firstParam(sp.category);
  return { title: category ? category : "All products" };
}

export default async function StorePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const sp = await searchParams;
  const category = firstParam(sp.category)?.trim() || undefined;
  return (
    <Collection
      slug={slug}
      basePath={`/store/${encodeURIComponent(slug)}`}
      category={category}
      categoryInQuery
      page={parsePage(firstParam(sp.page))}
      sort={parseSort(firstParam(sp.sort))}
    />
  );
}
