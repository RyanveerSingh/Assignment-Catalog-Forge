import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Share the local CatalogForge server over the internet through a Cloudflare quick tunnel: a free
 * public https URL with no account, valid while this process, the server and the laptop are up.
 *
 *   npm run tunnel
 *
 * Starts the production server (`next start`, embedded worker) when nothing answers on the port,
 * then prints the public URL. The URL changes on every start; a stable hostname needs a named
 * tunnel on a Cloudflare account with a domain.
 */
const PORT = Number(process.env.PORT ?? 3000);
const BASE = `http://localhost:${PORT}`;
const RELEASE = "https://github.com/cloudflare/cloudflared/releases/latest/download/";
const WINDOWS_BIN = path.join(homedir(), "cloudflared", "cloudflared.exe");

async function healthy(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureServer(): Promise<void> {
  if (await healthy()) {
    console.log(`server already answering on ${BASE}`);
    return;
  }
  console.log(`starting the production server on ${BASE} (run "npm run build" first if the build is stale)`);
  const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "-s", "start"], {
    env: { ...process.env, WORKER_MODE: process.env.WORKER_MODE ?? "embedded", SEED_DEMO: process.env.SEED_DEMO ?? "true", PORT: String(PORT) },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  child.on("exit", (code) => {
    console.error(`server exited with code ${code ?? "?"}`);
    process.exit(1);
  });
  for (let i = 0; i < 90; i++) {
    if (await healthy()) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("the server did not answer within 3 minutes");
}

async function cloudflaredPath(): Promise<string> {
  if (process.platform !== "win32") return "cloudflared"; // brew install cloudflared / apt install cloudflared
  if (existsSync(WINDOWS_BIN)) return WINDOWS_BIN;
  mkdirSync(path.dirname(WINDOWS_BIN), { recursive: true });
  console.log("downloading cloudflared (one-time, ~55 MB)…");
  const res = await fetch(`${RELEASE}cloudflared-windows-amd64.exe`);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(WINDOWS_BIN, Buffer.from(await res.arrayBuffer()));
  return WINDOWS_BIN;
}

async function main(): Promise<void> {
  await ensureServer();
  const bin = await cloudflaredPath();
  const tunnel = spawn(bin, ["tunnel", "--url", BASE, "--no-autoupdate"], { stdio: ["ignore", "pipe", "pipe"] });
  const announce = (chunk: Buffer): void => {
    const text = chunk.toString();
    const url = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(text)?.[0];
    if (url) {
      console.log(`\nPublic URL: ${url}\nSign in with demo@catalogforge.dev / demo1234. Keep this window open; close it to stop sharing.\n`);
    }
    if (/error|failed/i.test(text)) process.stderr.write(text);
  };
  tunnel.stdout.on("data", announce);
  tunnel.stderr.on("data", announce);
  tunnel.on("exit", (code) => {
    console.log(`tunnel closed (${code ?? "signal"})`);
    process.exit(code ?? 0);
  });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
