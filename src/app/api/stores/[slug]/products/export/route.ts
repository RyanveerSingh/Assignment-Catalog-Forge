import { CSV_BOM, streamJsonArray, streamProductsCsv, streamShopifyCsv } from "@/core/export";
import type { ExportProduct } from "@/core/export/types";
import { getDb } from "@/db/client";
import { iterateProductsForExport } from "@/db/repositories/export";
import { PRODUCT_STATUSES, type ProductStatus } from "@/db/schema";
import { getConfig } from "@/lib/config";
import { HttpError, withApi } from "@/lib/http";
import { optionalUuidQuery, uuidQueryList } from "@/lib/ids";
import { requireStore } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

const PAGE = 50;

/** Streams CSV, JSON or Shopify CSV; never buffers the whole catalog (EC-J7, J8, I6). */
export const GET = withApi(async (req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store } = await requireStore(slug);
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  if (!["csv", "json", "shopify"].includes(format)) throw new HttpError(400, "bad_format", "format must be csv, json or shopify");
  const statuses = url.searchParams.getAll("status").filter((s): s is ProductStatus => (PRODUCT_STATUSES as readonly string[]).includes(s));
  // Validated before the stream opens: a bad id failing inside the stream can only drop the connection.
  const importId = optionalUuidQuery(url.searchParams.get("importId"), "importId");
  const ids = uuidQueryList(url.searchParams.getAll("id").slice(0, 500), "id");
  const base = getConfig().APP_BASE_URL.replace(/\/$/, "");
  const imageUrl = (blobId: string): string => `${base}/api/img/${encodeURIComponent(slug)}/${blobId}`;
  const source = iterateProductsForExport(getDb(), store.id, imageUrl, { status: statuses.length ? statuses : undefined, importId, ids: ids.length ? ids : undefined });

  const stamp = new Date().toISOString().slice(0, 10);
  let filename = `catalogforge-${slug}-${stamp}.csv`;
  let contentType = "text/csv; charset=utf-8";
  let chunks: AsyncIterable<string>;
  if (format === "json") {
    filename = `catalogforge-${slug}-${stamp}.json`;
    contentType = "application/json; charset=utf-8";
    chunks = paged(source, (items) => streamJsonArray(items), "json");
  } else if (format === "shopify") {
    filename = `shopify-products-${slug}-${stamp}.csv`;
    chunks = prefixed(CSV_BOM, paged(source, (items) => streamShopifyCsv(items), "csv"));
  } else {
    chunks = paged(source, (items) => streamProductsCsv(items, { bom: true }), "csv");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
});

/**
 * The exporters are synchronous generators over an Iterable. Feed them one page of products at a
 * time: CSV pages repeat the header, so it is dropped after the first page; JSON pages each come
 * wrapped in "[" … "]", so the brackets are stripped and commas inserted between pages.
 */
async function* paged(source: AsyncIterable<ExportProduct>, make: (items: Iterable<ExportProduct>) => Iterable<string>, kind: "csv" | "json"): AsyncGenerator<string> {
  let page: ExportProduct[] = [];
  let pageIndex = 0;
  let emittedObject = false;
  function* flush(items: ExportProduct[], index: number): Generator<string> {
    const parts = [...make(items)];
    if (kind === "csv") {
      for (const [i, c] of parts.entries()) {
        if (index > 0 && i === 0) continue;
        yield c;
      }
      return;
    }
    const inner = parts.slice(1, -1);
    if (index === 0) yield "[";
    if (inner.length > 0 && emittedObject) yield ",";
    for (const c of inner) yield c;
    if (inner.length > 0) emittedObject = true;
  }
  for await (const item of source) {
    page.push(item);
    if (page.length >= PAGE) {
      yield* flush(page, pageIndex++);
      page = [];
    }
  }
  yield* flush(page, pageIndex++);
  if (kind === "json") yield "]";
}

async function* prefixed(prefix: string, inner: AsyncIterable<string>): AsyncGenerator<string> {
  yield prefix;
  for await (const c of inner) yield c;
}
