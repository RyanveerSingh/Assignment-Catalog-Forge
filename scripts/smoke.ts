import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * HTTP smoke test against a running CatalogForge (local or deployed):
 *   npx tsx scripts/smoke.ts --base http://localhost:3000 [--email demo@catalogforge.dev --password demo1234] [--store demo] [--sheet samples/messy-120.csv --photos samples/photos-messy.zip]
 * Logs in, uploads, waits for the import to finish, reads the hygiene report, products, guardrails and
 * the cleaning X-ray, assigns an unmatched photo, approves a product, loads the storefront in three
 * countries, imports a SQL dump, crashes the worker mid-import, downloads exports and the metrics.
 * Exits 1 on the first failure.
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

type ImportBody = { import: { status: string; counts: Record<string, number>; totalRows: number; productCount: number; pauseReason: string | null } };

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

async function upload(sheetPath: string, photosPath: string | null): Promise<string> {
  const form = new FormData();
  form.append("sheet", new Blob([readFileSync(path.resolve(sheetPath))]), path.basename(sheetPath));
  if (photosPath) form.append("photos", new Blob([readFileSync(path.resolve(photosPath))]), path.basename(photosPath));
  form.append("mode", "fast");
  const up = await call(`/api/stores/${store}/imports`, { method: "POST", body: form });
  const body = (await up.json()) as { importId?: string; warnings?: string[]; error?: { message: string } };
  check(up.status === 202 || up.status === 200, `upload ${path.basename(sheetPath)} ${up.status} ${body.error?.message ?? ""} warnings=${JSON.stringify(body.warnings ?? [])}`);
  return body.importId!;
}

async function waitForImport(importId: string, label: string): Promise<ImportBody["import"]> {
  const started = Date.now();
  let last: ImportBody["import"] | null = null;
  for (let i = 0; i < 900; i++) {
    const r = await call(`/api/stores/${store}/imports/${importId}`);
    last = ((await r.json()) as ImportBody).import;
    if (["completed", "needs_attention", "failed", "cancelled"].includes(last.status)) break;
    if (i % 15 === 0) console.log(`     ${label}: ${last.status} ${JSON.stringify(last.counts)} products ${last.productCount}${last.pauseReason ? ` [${last.pauseReason}]` : ""}`);
    await new Promise((res) => setTimeout(res, 1000));
  }
  check(last?.status === "completed", `${label} import ${last?.status} ${JSON.stringify(last?.counts)} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  return last!;
}

async function main(): Promise<void> {
  const started = Date.now();
  const health = await call("/api/health");
  check(health.ok, `health ${health.status}`);

  const login = await call("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  check(login.ok, `login ${login.status}`);

  const importId = await upload(sheet, photos || null);
  const imp = await waitForImport(importId, "messy");

  const hygiene = await call(`/api/stores/${store}/imports/${importId}/hygiene`);
  const hygieneBody = (await hygiene.json()) as { report: { stages: Array<{ key: string; headline: { value: number; unit: string }; items: unknown[] }> } };
  const ingest = hygieneBody.report?.stages?.find((s) => s.key === "ingest");
  check(hygiene.ok && hygieneBody.report.stages.length === 5 && ingest?.headline.value === imp.totalRows, `EC-J9 hygiene report: ${hygieneBody.report?.stages?.map((s) => `${s.key}=${s.headline.value} ${s.headline.unit}`).join(", ")}`);

  const rows = await call(`/api/stores/${store}/imports/${importId}/rows?status=needs_review&limit=5`);
  const rowsBody = (await rows.json()) as { total: number; rows: unknown[] };
  check(rows.ok, `rows needs_review total=${rowsBody.total}`);

  const sse = await call(`/api/stores/${store}/imports/${importId}/events`);
  check(sse.ok && sse.headers.get("content-type")?.includes("text/event-stream"), "SSE endpoint streams");
  await sse.body?.cancel();

  const list = await call(`/api/stores/${store}/products?importId=${importId}&limit=50&withCategories=true`);
  const listBody = (await list.json()) as { items: Array<{ id: string; status: string; title: string | null }>; total: number };
  check(list.ok && listBody.total > 0, `products listed total=${listBody.total}`);

  // Guardrails + X-ray: find a product the validator blocked something on, else fall back to the first.
  type Detail = { product: { version: number; status: string; claims: Array<{ quote?: string }>; guardrails: Array<{ text: string; kind: string; reason: string }>; reviewReasons: string[] }; variants: unknown[]; sourceRows: Array<{ xray?: unknown[] }>; translations: unknown[] };
  let first = listBody.items[0]!;
  let detailBody: Detail | null = null;
  for (const item of listBody.items) {
    const r = await call(`/api/stores/${store}/products/${item.id}`);
    const body = (await r.json()) as Detail | null;
    if (!detailBody) {
      detailBody = body;
      first = item;
    }
    if (body && body.product.guardrails.length > 0) {
      detailBody = body;
      first = item;
      break;
    }
  }
  check(detailBody !== null, `product detail "${first.title}" status=${detailBody?.product.status} claims=${detailBody?.product.claims.length} variants=${detailBody?.variants.length} sourceRows=${detailBody?.sourceRows.length} translations=${detailBody?.translations.length}`);
  const d = detailBody!;
  check(Array.isArray(d.product.guardrails), `EC-F8 guardrails on "${first.title}": ${d.product.guardrails.map((g) => `${g.kind}:${g.text}`).join(" | ") || "(none blocked)"}`);
  check(d.product.claims.every((c) => typeof c.quote === "string"), `EC-F8 every verified claim carries its quote (${d.product.claims.length})`);
  const xrayRows = d.sourceRows.filter((r) => Array.isArray(r.xray) && r.xray.length > 0).length;
  check(xrayRows > 0, `EC-F9 cleaning X-ray present on ${xrayRows}/${d.sourceRows.length} source rows`);

  const patch = await call(`/api/stores/${store}/products/${first.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: d.product.version, title: `${first.title ?? "Product"} (edited)` }) });
  check(patch.ok, `edit title ${patch.status}`);
  const stale = await call(`/api/stores/${store}/products/${first.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: d.product.version, title: "stale" }) });
  check(stale.status === 409, `EC-F7 stale version rejected ${stale.status}`);

  const approve = await call(`/api/stores/${store}/products/${first.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve", force: true }) });
  check(approve.ok, `approve ${approve.status}`);

  const after = await call(`/api/stores/${store}/products/${first.id}`);
  const afterBody = (await after.json()) as { product: { handle: string; published: unknown } };
  check(Boolean(afterBody.product.published), "published snapshot exists");

  // Unmatched photo tray: assign one orphan photo to the approved product and watch the tray shrink.
  const unmatched = await call(`/api/stores/${store}/photos?status=unmatched&limit=5`);
  const unmatchedBody = (await unmatched.json()) as { items: Array<{ id: string; originalName: string }>; total: number };
  check(unmatched.ok, `EC-C13 unmatched photos listed total=${unmatchedBody.total}`);
  if (unmatchedBody.total > 0) {
    const orphan = unmatchedBody.items[0]!;
    const assign = await call(`/api/stores/${store}/photos/${orphan.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "assign", productId: first.id }) });
    const again = await call(`/api/stores/${store}/photos?status=unmatched&limit=1`);
    const againBody = (await again.json()) as { total: number };
    check(assign.ok && againBody.total === unmatchedBody.total - 1, `EC-C13 assigned "${orphan.originalName}" to "${first.title}" (${assign.status}); unmatched ${unmatchedBody.total} → ${againBody.total}`);
  }

  // English shows the edit at once; DE/FR keep the previous translation until the re-translation job lands
  // (translate ahead, never while a shopper waits), so those checks wait for it.
  for (const country of ["US", "DE", "FR"]) {
    await call("/api/store-country", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ country }) });
    let ok = false;
    let bytes = 0;
    for (let i = 0; i < 90 && !ok; i++) {
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

  // A mysqldump goes through the same pipeline, parsed in memory, never executed (EC-A20).
  const dumpId = await upload("samples/dump-mysql.sql", null);
  const dump = await waitForImport(dumpId, "sql dump");
  check(dump.totalRows === 12 && dump.productCount >= 5, `EC-A20 dump-mysql.sql parsed to ${dump.totalRows} rows, ${dump.productCount} products`);

  // Crash the worker mid-import: the reaper reclaims the jobs, the import still completes (EC-E1, E16).
  const crashImportId = await upload("samples/tiny-10.csv", null);
  await new Promise((res) => setTimeout(res, 1500));
  const crash = await call("/api/admin/crash", { method: "POST" });
  const crashBody = (await crash.json()) as { ok?: boolean; dropped?: number; message?: string; error?: { message: string } };
  check(crash.ok && crashBody.ok, `EC-E16 crash: ${crashBody.message ?? crashBody.error?.message}`);
  const crashed = await waitForImport(crashImportId, "after crash");
  check(crashed.counts.failed === 0 && crashed.counts.done + crashed.counts.needs_review === crashed.totalRows, `EC-E1 import resumed after the crash: ${JSON.stringify(crashed.counts)} of ${crashed.totalRows}`);
  const healthAfter = await call("/api/health");
  check(healthAfter.ok, `health after crash ${healthAfter.status}`);

  for (const fmt of ["csv", "json", "shopify"]) {
    const ex = await call(`/api/stores/${store}/products/export?format=${fmt}&importId=${importId}`);
    const text = await ex.text();
    check(ex.ok && text.length > 100, `export ${fmt} ${text.length} bytes`);
  }

  const metrics = await call(`/api/stores/${store}/metrics`);
  const m = (await metrics.json()) as { products: { total: number }; cost: { totalMicros: number; savedMicros: number }; speed: { avgRowsPerMinute: number | null }; strategies: { rows: Array<{ key: string; costMicros: number }>; demo: boolean } };
  check(metrics.ok, `metrics products=${m.products.total} cost=$${(m.cost.totalMicros / 1e6).toFixed(4)} saved=$${(m.cost.savedMicros / 1e6).toFixed(4)} rows/min=${m.speed.avgRowsPerMinute}`);
  check(m.strategies?.rows?.length === 4, `EC-J10 cost strategies: ${m.strategies?.rows?.map((r) => `${r.key}=$${(r.costMicros / 1e6).toFixed(2)}`).join(", ")}${m.strategies?.demo ? " (demo, estimated)" : ""}`);

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
