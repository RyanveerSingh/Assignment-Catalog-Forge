import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { serializeImport } from "@/lib/serializers";
import { ImportLive } from "@/components/upload/import-live";
import { buildHygieneReport } from "@/core/metrics/hygiene";
import { getDb } from "@/db/client";
import { getImportHygiene } from "@/db/repositories/hygiene";
import { getImport, listImportEvents } from "@/db/repositories/imports";
import { optionalStore } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Import" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ImportPage({ params }: { params: Promise<{ store: string; importId: string }> }) {
  const { store: slug, importId } = await params;
  const ctx = await optionalStore(slug);
  if (!ctx) redirect("/login");
  // Postgres rejects a malformed uuid with an error, which would surface as a 500 instead of a 404.
  if (!UUID.test(importId)) notFound();
  const db = getDb();
  const imp = await getImport(db, ctx.store.id, importId);
  if (!imp) notFound();
  // Counted here as well so the hygiene flow renders with the page instead of after a client fetch.
  const [events, hygiene] = await Promise.all([listImportEvents(db, importId, 0, 200), getImportHygiene(db, ctx.store.id, importId)]);

  return (
    <ImportLive
      storeSlug={slug}
      initialImport={serializeImport(imp)}
      initialEvents={events.map((e) => ({ id: e.id, level: e.level, message: e.message, data: e.data, createdAt: e.createdAt.toISOString() }))}
      initialHygiene={buildHygieneReport(hygiene)}
    />
  );
}
