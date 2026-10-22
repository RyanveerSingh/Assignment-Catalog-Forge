import "../src/lib/env";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import autocannon from "autocannon";

/**
 * Storefront load test (EC-H6). Run it once with nothing else happening, then again while a
 * 10k-row import is running, and compare:
 *
 *   npx tsx scripts/load-test.ts --base http://localhost:3000 --store demo --handle <handle> --duration 30 --connections 50 --label idle
 *
 * Writes docs/load/<label>-<timestamp>.json and prints req/s and latency percentiles.
 */
interface Args {
  base: string;
  store: string;
  handle: string | null;
  duration: number;
  connections: number;
  label: string;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string, fallback: string): string => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
  };
  return {
    base: get("base", process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    store: get("store", "demo"),
    handle: get("handle", "") || null,
    duration: Number(get("duration", "30")),
    connections: Number(get("connections", "50")),
    label: get("label", "run"),
  };
}

async function run(url: string, args: Args): Promise<autocannon.Result> {
  return new Promise((resolve, reject) => {
    const instance = autocannon({ url, duration: args.duration, connections: args.connections, pipelining: 1, headers: { accept: "text/html" } }, (err, result) => (err ? reject(err) : resolve(result)));
    autocannon.track(instance, { renderProgressBar: true, renderResultsTable: false });
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const targets: Array<{ name: string; url: string }> = [{ name: "collection", url: `${args.base}/store/${args.store}` }];
  if (args.handle) targets.push({ name: "product", url: `${args.base}/store/${args.store}/p/${args.handle}` });
  const out: Record<string, unknown> = { label: args.label, at: new Date().toISOString(), duration: args.duration, connections: args.connections, targets: {} };
  for (const t of targets) {
    console.log(`\n→ ${t.name}: ${t.url}`);
    const r = await run(t.url, args);
    const summary = {
      requestsPerSecond: r.requests.average,
      latencyMs: { p50: r.latency.p50, p95: r.latency.p97_5 ?? r.latency.p99, p99: r.latency.p99, max: r.latency.max, mean: r.latency.mean },
      non2xx: r.non2xx,
      errors: r.errors,
      timeouts: r.timeouts,
      totalRequests: r.requests.total,
    };
    (out.targets as Record<string, unknown>)[t.name] = summary;
    console.log(`  req/s ${summary.requestsPerSecond.toFixed(1)} · p50 ${summary.latencyMs.p50} ms · p99 ${summary.latencyMs.p99} ms · max ${summary.latencyMs.max} ms · non-2xx ${summary.non2xx} · errors ${summary.errors}`);
  }
  const dir = path.join(process.cwd(), "docs", "load");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${args.label}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\nsaved ${file}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
