import { buildHygieneReport } from "@/core/metrics/hygiene";
import { getDb } from "@/db/client";
import { getImportHygiene } from "@/db/repositories/hygiene";
import { getImport } from "@/db/repositories/imports";
import { HttpError, json, withApi } from "@/lib/http";
import { requireUuidParam } from "@/lib/ids";
import { requireStore } from "@/lib/session";

type Ctx = { params: Promise<{ slug: string; id: string }> };

export const dynamic = "force-dynamic";

/** The data-hygiene flow for one import: what the deterministic stages did, counted from the tables of record. */
export const GET = withApi(async (_req: Request, { params }: Ctx) => {
  const { slug, id: rawId } = await params;
  const id = requireUuidParam(rawId, "import_not_found", "Import not found");
  const { store } = await requireStore(slug);
  const db = getDb();
  const imp = await getImport(db, store.id, id);
  if (!imp) throw new HttpError(404, "import_not_found", "Import not found");
  const report = buildHygieneReport(await getImportHygiene(db, store.id, id));
  return json({ status: imp.status, report, generatedAt: new Date().toISOString() });
});
