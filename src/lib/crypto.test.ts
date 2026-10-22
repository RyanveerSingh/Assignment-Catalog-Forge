import { beforeAll, describe, expect, it } from "vitest";
import { resetConfigForTests } from "./config";
import { decryptSecret, encryptSecret, hashPassword, maskSecret, stableHash, verifyPassword } from "./crypto";

describe("crypto", () => {
  beforeAll(() => {
    process.env.DATABASE_URL ??= "postgres://x";
    process.env.APP_SECRET = "unit-test-secret-at-least-16";
    resetConfigForTests();
  });

  it("stableHash ignores key order", () => {
    expect(stableHash({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(stableHash({ b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(stableHash({ a: 1 })).not.toBe(stableHash({ a: 2 }));
  });

  it("hashes and verifies passwords", async () => {
    const hash = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("EC-J5: encrypts and decrypts secrets with AES-GCM and rejects tampering", () => {
    const enc = encryptSecret("sk-ant-example-key");
    expect(enc).not.toContain("sk-ant");
    expect(decryptSecret(enc)).toBe("sk-ant-example-key");
    const tampered = enc.slice(0, -2) + (enc.endsWith("A") ? "BB" : "AA");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("EC-I2: masks secrets for display", () => {
    expect(maskSecret("sk-ant-api03-abcdefghijklmnop")).toBe("sk-ant-…mnop");
    expect(maskSecret("short")).toBe("••••");
  });
});
