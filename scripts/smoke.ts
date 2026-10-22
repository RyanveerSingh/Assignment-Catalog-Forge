import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * HTTP smoke test against a running CatalogForge (local or deployed):
 *   npx tsx scripts/smoke.ts --base http://localhost:3000 [--email demo@catalogforge.dev --password demo1234] [--store demo] [--sheet samples/messy-120.csv --photos samples/photos-messy.zip]
 * Logs in, uploads, waits for the import to finish, reads products, approves one, loads the storefront,
 * downloads an export and the metrics. Exits 1 on the first failure.
 */
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const base = arg("base", "http://localhost:3000").replace(/\/$/, "");
const email = arg("email", "demo@catalogforge.dev");
const password = arg("password", "demo1234");
const store = arg("store", "demo");
const sheet = arg("sheet", "samples/messy-120.csv");
const photos = arg("photos", "samples/photos-messy.zip");
const jar = new Map<string, string>();

function check(cond: unknown, msg: string): void {
  if (!cond) {
    console.error(`FAIL ${msg}`);
    process.exit(1);
  }
  console.log(`ok   ${msg}`);
}

async function call(pathname: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  if (jar.size) headers.set("cookie", [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "));
  const res = await fetch(`${base}${pathname}`, { ...init, headers, redirect: "manual" });
  for (const set of res.headers.getSetCookie()) {
    const [pair] = set.split(";");
    const eq = pair?.indexOf("=") ?? -1;
    if (pair && eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return res;
}

async function main(): Promise<void> {
  const started = Date.now();
  const health = await call("/api/health");
  check(health.ok, `health ${health.status}`);

  const login = await call("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  check(login.ok, `login ${login.status}`);

  const form = new FormData();
  form.append("sheet", new Blob([readFileSync(path.resolve(sheet))]), path.basename(sheet));
  if (photos) form.append("photos", new Blob([readFileSync(path.resolve(photos))]), path.basename(photos));
  form.append("mode", "fast");
  const up = await call(`/api/stores/${store}/imports`, { method: "POST", body: form });
  const upBody = (await up.json()) as { importId?: string; reused?: boolean; warnings?: string[]; error?: { message: string } };
  check(up.status === 202 || up.status === 200, `upload ${up.status} ${upBody.error?.message ?? ""} warnings=${JSON.stringify(upBody.warnings ?? [])}`);
  const importId = upBody.importId!;

  let status = "";
  let counts: Record<string, number> = {};
  for (let i = 0; i < 600; i++) {
    const r = await call(`/api/stores/${store}/imports/${importId}`);
    const body = (await r.json()) as { import: { status: string; counts: Record<string, number>; totalRows: number; productCount: number; pauseReason: string | null } };
    status = body.import.status;
    counts = body.import.counts;
    if (["completed", "needs_attention", "failed", "cancelled"].includes(status)) break;
    if (i % 10 === 0) console.log(`     ${status} ${JSON.stringify(counts)} products ${body.import.productCount}${body.import.pauseReason ? ` [${body.import.pauseReason}]` : ""}`);
    await new Promise((res) => setTimeout(res, 1000));
  }
  check(status === "completed", `import ${status} ${JSON.stringify(counts)} in ${((Date.now() - started) / 1000).toFixed(0)} s`);

  const rows = await call(`/api/stores/${store}/imports/${importId}/rows?status=needs_review&limit=5`);
  const rowsBody = (await rows.json()) as { total: number; rows: unknown[] };
  check(rows.ok, `rows needs_review total=${rowsBody.total}`);

  const sse = await call(`/api/stores/${store}/imports/${importId}/events`);
  check(sse.ok && sse.headers.get("content-type")?.includes("text/event-stream"), "SSE endpoint streams");
  await sse.body?.cancel();

  const list = await call(`/api/stores/${store}/products?importId=${importId}&limit=10&withCategories=true`);
  const listBody = (await list.json()) as { items: Array<{ id: string; status: string; title: string | null; minConfidence: number | null }>; total: number };
  check(list.ok && listBody.total > 0, `products listed total=${listBody.total}`);

  const first = listBody.items[0]!;
  const detail = await call(`/api/stores/${store}/products/${first.id}`);
  const detailBody = (await detail.json()) as { product: { version: number; status: string; claims: unknown[]; reviewReasons: string[] }; variants: unknown[]; sourceRows: unknown[]; translations: unknown[] };
  check(detail.ok, `product detail "${first.title}" status=${detailBody.product.status} claims=${detailBody.product.claims.length} variants=${detailBody.variants.length} sourceRows=${detailBody.sourceRows.length} translations=${detailBody.translations.length} reasons=${detailBody.product.reviewReasons.join(" | ")}`);

  const patch = await call(`/api/stores/${store}/products/${first.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: detailBody.product.version, title: `${first.title ?? "Product"} (edited)` }) });
  check(patch.ok, `edit title ${patch.status}`);
  const stale = await call(`/api/stores/${store}/products/${first.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: detailBody.product.version, title: "stale" }) });
  check(stale.status === 409, `EC-F7 stale version rejected ${stale.status}`);

  const approve = await call(`/api/stores/${store}/products/${first.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve", force: true }) });
  check(approve.ok, `approve ${approve.status}`);

  const after = await call(`/api/stores/${store}/products/${first.id}`);
  const afterBody = (await after.json()) as { product: { handle: string; published: unknown } };
  check(Boolean(afterBody.product.published), "published snapshot exists");

  // English shows the edit at once; DE/FR keep the previous translation until the re-translation job lands
  // (translate ahead, never while a shopper waits), so those checks wait for it.
  for (const country of ["US", "DE", "FR"]) {
    await call("/api/store-country", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ country }) });
    let ok = false;
    let bytes = 0;
    for (let i = 0; i < 45 && !ok; i++) {
      const page = await call(`/store/${store}/p/${afterBody.product.handle}`);
      const html = await page.text();
      bytes = html.length;
      ok = page.ok && html.includes("(edited)");
      if (!ok) await new Promise((res) => setTimeout(res, 1000));
    }
    check(ok, `storefront product page ${country} shows the edited title (${bytes} bytes)`);
  }
  const collection = await call(`/store/${store}`);
  check(collection.ok, `storefront collection ${collection.status}`);
  const missing = await call(`/store/${store}/p/does-not-exist`);
  check(missing.status === 404, `EC-H1 unknown handle 404 (${missing.status})`);

  for (const fmt of ["csv", "json", "shopify"]) {
    const ex = await call(`/api/stores/${store}/products/export?format=${fmt}&importId=${importId}`);
    const text = await ex.text();
    check(ex.ok && text.length > 100, `export ${fmt} ${text.length} bytes`);
  }

  const metrics = await call(`/api/stores/${store}/metrics`);
  const m = (await metrics.json()) as { products: { total: number }; cost: { totalMicros: number; savedMicros: number }; speed: { avgRowsPerMinute: number | null } };
  check(metrics.ok, `metrics products=${m.products.total} cost=$${(m.cost.totalMicros / 1e6).toFixed(4)} saved=$${(m.cost.savedMicros / 1e6).toFixed(4)} rows/min=${m.speed.avgRowsPerMinute}`);

  const settings = await call(`/api/stores/${store}/settings`);
  check(settings.ok, `settings ${settings.status}`);
  const chaos = await call("/api/admin/chaos");
  check(chaos.ok, `chaos ${JSON.stringify(await chaos.json())}`);

  for (const p of [`/app/${store}/upload`, `/app/${store}/upload/${importId}`, `/app/${store}/products`, `/app/${store}/storefront`, `/app/${store}/metrics`, `/app/${store}/settings`]) {
    const r = await call(p);
    const html = await r.text();
    check(r.ok && !/Application error|Internal Server Error/i.test(html), `page ${p} ${r.status}`);
  }
  const loginRedirect = await call("/login");
  check(loginRedirect.status === 307, `signed-in /login redirects (${loginRedirect.status})`);
  console.log(`\nALL OK in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
