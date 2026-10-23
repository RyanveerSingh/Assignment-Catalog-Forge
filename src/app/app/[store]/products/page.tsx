import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ext/page-header";
import { ProductsWorkspace } from "@/components/products/products-workspace";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/db/client";
import { countProductsByStatus } from "@/db/repositories/overview";
import { optionalStore } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProductsPage({ params, searchParams }: { params: Promise<{ store: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ store }, sp] = await Promise.all([params, searchParams]);
  const ctx = await optionalStore(store);
  if (!ctx) redirect("/login");
  const importParam = sp.importId;
  const importId = (Array.isArray(importParam) ? importParam[0] : importParam) ?? "";
  // One index scan, so the status strip carries real numbers in the first paint instead of a skeleton.
  const statusCounts = await countProductsByStatus(getDb(), ctx.store.id);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Products" description="Review what the AI wrote against the rows it came from, then approve to publish." />
      <Suspense fallback={<Skeleton className="h-40 rounded-2xl" aria-hidden />}>
        <ProductsWorkspace storeSlug={store} initialImportId={importId} initialStatusCounts={statusCounts} />
      </Suspense>
    </div>
  );
}
