import "../src/lib/env";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { GroundTruthFile } from "../src/core/types";
import { closeDb, getDb } from "../src/db/client";

/** Dev helper: compare the latest import's grouping against a ground-truth file by SKU membership. */
async function main(): Promise<void> {
  const truthFile = process.argv[2] ?? "samples/ground-truth/bulk-1000.json";
  const truth = JSON.parse(readFileSync(path.resolve(truthFile), "utf8")) as GroundTruthFile;
  const db = getDb();
  const [imp] = (await db.execute<{ id: string; name: string }>(sql`select id, name from imports order by created_at desc limit 1`)).rows;
  if (!imp) throw new Error("no import");
  const rows = (
    await db.execute<{ product_key: string; key_source: string; title: string | null; skus: string[] }>(sql`
      select p.product_key, p.group_data->>'keySource' as key_source, p.group_data->>'title' as title, array_agg(v.sku order by v.sku) as skus
        from products p join variants v on v.product_id = p.id
       where p.last_import_id = ${imp.id}
       group by p.id
    `)
  ).rows;
  console.log(`import ${imp.name}: derived ${rows.length} products, truth ${truth.products.length}`);

  const skuToDerived = new Map<string, string>();
  for (const r of rows) for (const s of r.skus) skuToDerived.set(s.toUpperCase(), r.product_key);
  const bySource = new Map<string, number>();
  for (const r of rows) bySource.set(r.key_source, (bySource.get(r.key_source) ?? 0) + 1);
  console.log("derived key sources:", Object.fromEntries(bySource));

  // Truth products that landed in the same derived product → merges.
  const derivedToTruth = new Map<string, Set<string>>();
  for (const t of truth.products) {
    for (const v of t.variants) {
      const d = skuToDerived.get(v.sku.toUpperCase());
      if (!d) continue;
      const set = derivedToTruth.get(d) ?? new Set<string>();
      set.add(t.productKey);
      derivedToTruth.set(d, set);
    }
  }
  const merges = [...derivedToTruth.entries()].filter(([, s]) => s.size > 1);
  console.log(`derived products that merge several truth products: ${merges.length}`);
  for (const [d, set] of merges.slice(0, 12)) {
    const row = rows.find((r) => r.product_key === d);
    console.log(`  ${d} (${row?.key_source}) "${row?.title}" ← ${[...set].join(", ")}  skus=${row?.skus.slice(0, 6).join(",")}${(row?.skus.length ?? 0) > 6 ? "…" : ""}`);
  }
  // Truth products split across several derived products.
  const truthToDerived = new Map<string, Set<string>>();
  for (const t of truth.products) {
    for (const v of t.variants) {
      const d = skuToDerived.get(v.sku.toUpperCase());
      if (!d) continue;
      const set = truthToDerived.get(t.productKey) ?? new Set<string>();
      set.add(d);
      truthToDerived.set(t.productKey, set);
    }
  }
  const splits = [...truthToDerived.entries()].filter(([, s]) => s.size > 1);
  console.log(`truth products split across derived products: ${splits.length}`);
  for (const [t, set] of splits.slice(0, 8)) console.log(`  ${t} → ${[...set].join(", ")}`);
  const missing = truth.products.flatMap((t) => t.variants.filter((v) => v.sku && !skuToDerived.has(v.sku.toUpperCase())).map((v) => v.sku));
  console.log(`truth SKUs not found in derived variants: ${missing.length} ${missing.slice(0, 10).join(",")}`);
  await closeDb();
}

main().catch(async (err: unknown) => {
  console.error(err);
  await closeDb();
  process.exitCode = 1;
});
