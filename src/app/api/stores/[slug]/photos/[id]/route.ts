import { z } from "zod";
import { getDb } from "@/db/client";
import { assignPhotoToProduct, dismissPhoto, restorePhoto } from "@/db/repositories/photos";
import { republishIfLive } from "@/jobs/publish";
import { HttpError, json, withApi } from "@/lib/http";
import { requireStore } from "@/lib/session";

type Ctx = { params: Promise<{ slug: string; id: string }> };

const UUID_RE = /^[0-9a-f-]{36}$/i;

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("assign"), productId: z.string().regex(UUID_RE) }),
  z.object({ action: z.literal("dismiss") }),
  z.object({ action: z.literal("restore") }),
]);

/** Manual photo decisions (EC-C13). Body: { action: "assign", productId } | { action: "dismiss" } | { action: "restore" }. */
export const PATCH = withApi(async (req: Request, { params }: Ctx) => {
  const { slug, id } = await params;
  const { store, user } = await requireStore(slug);
  if (!UUID_RE.test(id)) throw new HttpError(404, "photo_not_found", "Photo not found");
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "invalid_body", "Invalid photo action", parsed.error.issues);
  const db = getDb();
  const a = parsed.data;
  const result = await (async () => {
    switch (a.action) {
      case "assign":
        return assignPhotoToProduct(db, store.id, id, a.productId, user.id);
      case "dismiss":
        return dismissPhoto(db, store.id, id, user.id);
      case "restore":
        return restorePhoto(db, store.id, id, user.id);
    }
  })();
  if (!result.ok) {
    const notFound = result.code === "not_found" || result.code === "product_not_found";
    throw new HttpError(notFound ? 404 : 409, result.code ?? "error", result.message ?? "Action failed");
  }
  // A live product shows its photos from the storefront rows, so rebuild them now rather than on the next approve.
  if (a.action === "assign") await republishIfLive(db, a.productId);
  return json({ ok: true });
});
