export interface StoredBlob {
  id: string;
  sha256: string;
  size: number;
  mime: string;
}

export interface BlobContent {
  data: Buffer;
  mime: string;
  size: number;
}

/**
 * Where uploaded sheets and processed photos live. `pg` keeps them in Postgres (free deployment),
 * `local` on disk for development, `s3` on any S3-compatible bucket for real scale.
 */
export interface StorageDriver {
  readonly name: "pg" | "local" | "s3";
  /** Store bytes; identical content for the same store is deduplicated by sha256. */
  put(storeId: string, data: Buffer, mime: string): Promise<StoredBlob>;
  get(storeId: string, id: string): Promise<BlobContent | null>;
  delete(storeId: string, id: string): Promise<void>;
}
