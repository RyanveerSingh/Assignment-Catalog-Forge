import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getConfig } from "./config";

const scrypt = promisify(scryptCb);

export function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Stable hash of any JSON-serialisable value (keys sorted) for idempotency keys and caches. */
export function stableHash(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

// --- passwords -------------------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, keyB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, "base64");
  const actual = (await scrypt(password, Buffer.from(saltB64, "base64"), expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// --- secrets at rest (per-store API keys, EC-J5) ----------------------------

function serverKey(): Buffer {
  return createHash("sha256").update(getConfig().APP_SECRET).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", serverKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

/** A stored key that fails to decrypt (rotated server secret, tampered row) counts as "no key", never as a crash. */
export function safeDecrypt(stored: string): string | null {
  try {
    return decryptSecret(stored);
  } catch {
    return null;
  }
}

export function decryptSecret(stored: string): string {
  const [v, ivB64, tagB64, encB64] = stored.split(".");
  if (v !== "v1" || !ivB64 || !tagB64 || !encB64) throw new Error("unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", serverKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB64, "base64")), decipher.final()]).toString("utf8");
}

/** Show only the start of an API key in the UI (EC-I2). */
export function maskSecret(secret: string): string {
  if (secret.length <= 10) return "••••";
  return `${secret.slice(0, 7)}…${secret.slice(-4)}`;
}
