import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serializeImport } from "@/lib/serializers";
import { PageHeader } from "@/components/ext/page-header";
import { ImportsTable } from "@/components/upload/imports-table";
import { RECENT_IMPORTS_LIMIT } from "@/components/upload/recent-imports";
import { OverviewBand } from "@/components/upload/overview-band";
import { UploadPanel } from "@/components/upload/upload-panel";
import { getDb } from "@/db/client";
import { listImports } from "@/db/repositories/imports";
import { getStoreOverview } from "@/db/repositories/overview";
import { optionalStore } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Upload" };

export default async function UploadPage({ params }: { params: Promise<{ store: string }> }) {
  const { store: slug } = await params;
  const ctx = await optionalStore(slug);
  if (!ctx) redirect("/login");
  const db = getDb();
  // Both are index-bounded reads; fetched side by side so the overview adds no round trip of its own.
  const [rows, overview] = await Promise.all([listImports(db, ctx.store.id, { limit: RECENT_IMPORTS_LIMIT }), getStoreOverview(db, ctx.store.id)]);
  const imports = rows.map(serializeImport);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Upload a supplier sheet" description="Drop a CSV, XLSX or SQL dump, or paste a Google Sheets link, with any photos. Every row stays visible while it is parsed, cleaned, grouped and written." />
      <UploadPanel storeSlug={slug} />
      <OverviewBand storeSlug={slug} overview={overview} latest={imports[0] ?? null} />
      <ImportsTable storeSlug={slug} initialImports={imports} />
    </div>
  );
}
