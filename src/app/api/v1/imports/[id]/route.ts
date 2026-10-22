import { getDb } from "@/db/client";
import { getImport, listImportEvents } from "@/db/repositories/imports";
import { HttpError, json, withApi } from "@/lib/http";
import { requireApiKeyStore } from "@/lib/session";
import { serializeImport } from "@/app/api/stores/[slug]/imports/route";

export const GET = withApi(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { storeId } = await requireApiKeyStore(req);
  const { id } = await params;
  const db = getDb();
  const imp = await getImport(db, storeId, id);
  if (!imp) throw new HttpError(404, "import_not_found", "Import not found");
  const events = await listImportEvents(db, id, 0, 50);
  return json({ import: serializeImport(imp), events: events.map((e) => ({ id: e.id, level: e.level, message: e.message, createdAt: e.createdAt.toISOString() })) });
});
