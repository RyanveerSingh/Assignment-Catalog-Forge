import { CSV_BOM, streamJsonArray, streamProductsCsv, streamShopifyCsv } from "@/core/export";
import { getDb } from "@/db/client";
import { iterateProductsForExport } from "@/db/repositories/export";
import { PRODUCT_STATUSES, type ProductStatus } from "@/db/schema";
import { getConfig } from "@/lib/config";
import { HttpError, withApi } from "@/lib/http";
import { requireStore } from "@/lib/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/** Streams CSV, JSON or Shopify CSV; never buffers the whole catalog (EC-J7, J8, I6). */
export const GET = withApi(async (req: Request, { params }: Ctx) => {
  const { slug } = await params;
  const { store } = await requireStore(slug);
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  if (!["csv", "json", "shopify"].includes(format)) throw new HttpError(400, "bad_format", "format must be csv, json or shopify");
  const statuses = url.searchParams.getAll("status").filter((s): s is ProductStatus => (PRODUCT_STATUSES as readonly string[]).includes(s));
  const importId = url.searchParams.get("importId") || undefined;
  const ids = url.searchParams.getAll("id").slice(0, 500);
  const base = getConfig().APP_BASE_URL.replace(/\/$/, "");
  const imageUrl = (blobId: string): string => `${base}/api/img/${encodeURIComponent(slug)}/${blobId}`;
  const source = iterateProductsForExport(getDb(), store.id, imageUrl, { status: statuses.length ? statuses : undefined, importId, ids: ids.length ? ids : undefined });

  const encoder = new TextEncoder();
  const stamp = new Date().toISOString().slice(0, 10);
  let filename = `catalogforge-${slug}-${stamp}.csv`;
  let contentType = "text/csv; charset=utf-8";
  let chunks: AsyncIterable<string>;
  if (format === "json") {
    filename = `catalogforge-${slug}-${stamp}.json`;
    contentType = "application/json; charset=utf-8";
    chunks = asyncify(streamJsonArray, source);
  } else if (format === "shopify") {
    filename = `shopify-products-${slug}-${stamp}.csv`;
    chunks = prefixed(CSV_BOM, asyncify(streamShopifyCsv, source));
  } else {
    chunks = asyncify((it) => streamProductsCsv(it, { bom: true }), source);
  }

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

/** The exporters are synchronous generators over an Iterable; feed them from the async DB stream one page at a time. */
async function* asyncify<T>(make: (items: Iterable<T>) => Iterable<string>, source: AsyncIterable<T>): AsyncGenerator<string> {
  const buffer: T[] = [];
  let done = false;
  const iterator = source[Symbol.asyncIterator]();
  // Pull products lazily: a tiny sync iterable that is refilled between yields.
  const pullable: Iterable<T> = {
    [Symbol.iterator]() {
      return {
        next(): IteratorResult<T> {
          const v = buffer.shift();
          return v === undefined ? { done: true, value: undefined as never } : { done: false, value: v };
        },
      };
    },
  };
  let header = true;
  while (!done) {
    const r = await iterator.next();
    if (r.done) {
      done = true;
    } else {
      buffer.push(r.value);
    }
    if (buffer.length >= 50 || done) {
      // Each call re-runs the generator over the current buffer; strip repeated headers after the first batch.
      let first = true;
      for (const chunk of make(pullable)) {
        if (!header && first && (chunk.startsWith("﻿") || /^"?Handle|^"?handle|^\[/.test(chunk))) {
          first = false;
          if (chunk === "[" || chunk === "]") continue;
          continue;
        }
        first = false;
        if (!header && (chunk === "[" || chunk === "]")) continue;
        yield chunk;
      }
      header = false;
    }
  }
}

async function* prefixed(prefix: string, inner: AsyncIterable<string>): AsyncGenerator<string> {
  yield prefix;
  for await (const c of inner) yield c;
}
