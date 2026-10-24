import { eq } from "drizzle-orm";
import { getStorefrontDb } from "@/db/client";
import { stores } from "@/db/schema";
import { isUuid } from "@/lib/ids";
import { getStorage } from "@/providers/storage";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ store: string; id: string }> };

/** Public image route for the storefront and dashboard. Blob ids are UUIDs scoped to the store. */
export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const { store: slug, id } = await params;
  if (!isUuid(id)) return new Response("not found", { status: 404 });
  const [store] = await getStorefrontDb().select({ id: stores.id }).from(stores).where(eq(stores.slug, slug)).limit(1);
  if (!store) return new Response("not found", { status: 404 });
  const blob = await getStorage().get(store.id, id);
  if (!blob) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(blob.data), {
    headers: {
      "Content-Type": blob.mime,
      "Content-Length": String(blob.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
