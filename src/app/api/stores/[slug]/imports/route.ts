import { getDb } from "@/db/client";
import { listImports } from "@/db/repositories/imports";
import { getConfig } from "@/lib/config";
import { capImportBudget, isLockedDemoUser } from "@/lib/demo-lockdown";
import { json, parseIntParam, withApi } from "@/lib/http";
import { readImportRequest } from "@/lib/import-request";
import { serializeImport } from "@/lib/serializers";
import { requireStore } from "@/lib/session";
import { acceptUpload } from "@/lib/upload";

type Ctx = { params: Promise<{ slug: string }> };

export const GET = withApi(async (req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store } = await requireStore(slug);
  const url = new URL(req.url);
  const limit = parseIntParam(url.searchParams.get("limit"), 25, 1, 100);
  const offset = parseIntParam(url.searchParams.get("offset"), 0);
  const rows = await listImports(getDb(), store.id, { limit, offset });
  return json({ imports: rows.map(serializeImport) });
});

/**
 * Multipart upload: `sheet` (one CSV/XLSX/SQL dump) plus any number of `photos` (images or ZIPs);
 * or `sheetUrl` (a public Google Sheets link) as a form field or in a JSON body, which is fetched
 * server-side and then takes the exact same path as an uploaded file. Returns 202 immediately.
 */
export const POST = withApi(async (req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store, user } = await requireStore(slug);
  const request = await readImportRequest(req);
  const cfg = getConfig();
  // The shared demo spends the operator's key: the per-import budget is clamped, not refused.
  const capped = isLockedDemoUser(user) ? capImportBudget(request.budgetCents, cfg.AI_IMPORT_BUDGET_CENTS, cfg.DEMO_BUDGET_CAP_CENTS) : null;
  const result = await acceptUpload(getDb(), { storeId: store.id, ...request, ...(capped ? { budgetCents: capped.budgetCents } : {}) });
  if (capped?.warning && !result.reused) result.warnings.push(capped.warning);
  return json(result, { status: result.reused ? 200 : 202 });
});
