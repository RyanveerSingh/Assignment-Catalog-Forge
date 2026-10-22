import { getDb } from "@/db/client";
import { getStoreMetrics } from "@/db/repositories/metrics";
import { json, withApi } from "@/lib/http";
import { requireStore } from "@/lib/session";

type Ctx = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export const GET = withApi(async (_req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store } = await requireStore(slug);
  return json(await getStoreMetrics(getDb(), store.id));
});
