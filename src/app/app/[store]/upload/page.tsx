import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serializeImport } from "@/lib/serializers";
import { PageHeader } from "@/components/ext/page-header";
import { ImportsTable } from "@/components/upload/imports-table";
import { OverviewBand } from "@/components/upload/overview-band";
import { SamplesCard } from "@/components/upload/samples-card";
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
  const [rows, overview] = await Promise.all([listImports(db, ctx.store.id, { limit: 25 }), getStoreOverview(db, ctx.store.id)]);
  const imports = rows.map(serializeImport);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Imports"
        title="Upload a supplier sheet"
        description="Drop a CSV, XLSX or SQL dump, or paste a Google Sheets link, with any photos. Parsing, cleaning, grouping and AI writing run in the background; every row stays visible while it happens."
      />
      <OverviewBand storeSlug={slug} overview={overview} latest={imports[0] ?? null} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
        <UploadPanel storeSlug={slug} />
        <SamplesCard />
      </div>
      <ImportsTable storeSlug={slug} initialImports={imports} />
    </div>
  );
}
