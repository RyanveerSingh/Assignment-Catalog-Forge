import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { blobs } from "@/db/schema";
import { sha256Hex } from "@/lib/crypto";
import type { BlobContent, StorageDriver, StoredBlob } from "./types";

/** Blobs in Postgres. Fine for a demo-sized catalog; the S3 driver is the path beyond that (EC-E19). */
export function createPgStorage(db: Db): StorageDriver {
  return {
    name: "pg",
    async put(storeId, data, mime): Promise<StoredBlob> {
      const sha256 = sha256Hex(data);
      const [existing] = await db
        .select({ id: blobs.id, size: blobs.size, mime: blobs.mime })
        .from(blobs)
        .where(and(eq(blobs.storeId, storeId), eq(blobs.sha256, sha256)))
        .limit(1);
      if (existing) return { id: existing.id, sha256, size: existing.size, mime: existing.mime };
      const [row] = await db.insert(blobs).values({ storeId, sha256, mime, size: data.length, data }).returning({ id: blobs.id });
      if (!row) throw new Error("blob insert returned no row");
      return { id: row.id, sha256, size: data.length, mime };
    },
    async get(storeId, id): Promise<BlobContent | null> {
      const [row] = await db
        .select({ data: blobs.data, mime: blobs.mime, size: blobs.size })
        .from(blobs)
        .where(and(eq(blobs.storeId, storeId), eq(blobs.id, id)))
        .limit(1);
      return row ? { data: row.data, mime: row.mime, size: row.size } : null;
    },
    async delete(storeId, id): Promise<void> {
      await db.delete(blobs).where(and(eq(blobs.storeId, storeId), eq(blobs.id, id)));
    },
  };
}
