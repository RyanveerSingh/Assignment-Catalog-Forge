import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { sha256Hex } from "@/lib/crypto";
import type { BlobContent, StorageDriver, StoredBlob } from "./types";

/** Development driver: `.data/blobs/<store>/<id>` plus a sidecar `.json` with the mime type. */
export function createLocalStorage(root = ".data/blobs"): StorageDriver {
  const dirFor = (storeId: string): string => path.join(root, storeId);
  return {
    name: "local",
    async put(storeId, data, mime): Promise<StoredBlob> {
      const dir = dirFor(storeId);
      await mkdir(dir, { recursive: true });
      const sha256 = sha256Hex(data);
      const id = randomUUID();
      await writeFile(path.join(dir, id), data);
      await writeFile(path.join(dir, `${id}.json`), JSON.stringify({ mime, sha256, size: data.length }));
      return { id, sha256, size: data.length, mime };
    },
    async get(storeId, id): Promise<BlobContent | null> {
      try {
        const dir = dirFor(storeId);
        const meta = JSON.parse(await readFile(path.join(dir, `${id}.json`), "utf8")) as { mime: string; size: number };
        const data = await readFile(path.join(dir, id));
        return { data, mime: meta.mime, size: data.length };
      } catch {
        return null;
      }
    },
    async delete(storeId, id): Promise<void> {
      const dir = dirFor(storeId);
      await rm(path.join(dir, id), { force: true });
      await rm(path.join(dir, `${id}.json`), { force: true });
    },
  };
}
