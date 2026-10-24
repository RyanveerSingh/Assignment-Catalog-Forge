import { getDb } from "@/db/client";
import { listImports } from "@/db/repositories/imports";
import { getConfig } from "@/lib/config";
import { capImportBudget, isDemoLockdown } from "@/lib/demo-lockdown";
import { json, parseIntParam, withApi } from "@/lib/http";
import { readImportRequest } from "@/lib/import-request";
import { requireApiKeyStore } from "@/lib/session";
import { acceptUpload } from "@/lib/upload";
import { serializeImport } from "@/lib/serializers";

/**
 * Public import API (Bearer `cf_live_…` key, created in Settings).
 *   POST /api/v1/imports   multipart: sheet=<file> photos=<file>… mode=fast|economy
 *                          or sheetUrl=<public Google Sheets link> (form field or JSON body)
 *   GET  /api/v1/imports   list
 * Returns 202 with the import id; poll GET /api/v1/imports/{id}.
 */
export const POST = withApi(async (req: Request) => {
  const { storeId } = await requireApiKeyStore(req);
  const request = await readImportRequest(req);
  const cfg = getConfig();
  // Keys on the shared demo belong to the demo account, so its budget cap applies here too.
  const capped = isDemoLockdown() ? capImportBudget(request.budgetCents, cfg.AI_IMPORT_BUDGET_CENTS, cfg.DEMO_BUDGET_CAP_CENTS) : null;
  const result = await acceptUpload(getDb(), { storeId, ...request, ...(capped ? { budgetCents: capped.budgetCents } : {}) });
  if (capped?.warning && !result.reused) result.warnings.push(capped.warning);
  return json({ importId: result.importId, reused: result.reused, warnings: result.warnings, statusUrl: `/api/v1/imports/${result.importId}` }, { status: result.reused ? 200 : 202 });
});

export const GET = withApi(async (req: Request) => {
  const { storeId } = await requireApiKeyStore(req);
  const url = new URL(req.url);
  const rows = await listImports(getDb(), storeId, { limit: parseIntParam(url.searchParams.get("limit"), 25, 1, 100), offset: parseIntParam(url.searchParams.get("offset"), 0) });
  return json({ imports: rows.map(serializeImport) });
});
