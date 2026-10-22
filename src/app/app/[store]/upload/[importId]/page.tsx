import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { serializeImport } from "@/lib/serializers";
import { ImportLive } from "@/components/upload/import-live";
import { getDb } from "@/db/client";
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
  const events = await listImportEvents(db, importId, 0, 200);

  return (
    <ImportLive
      storeSlug={slug}
      initialImport={serializeImport(imp)}
      initialEvents={events.map((e) => ({ id: e.id, level: e.level, message: e.message, data: e.data, createdAt: e.createdAt.toISOString() }))}
    />
  );
}
