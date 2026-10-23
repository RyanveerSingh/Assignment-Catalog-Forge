import { getDb } from "@/db/client";
import { getConfig } from "@/lib/config";
import { createLocalStorage } from "./local";
import { createPgStorage } from "./pg";
import type { StorageDriver } from "./types";

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  const cfg = getConfig();
  switch (cfg.STORAGE_DRIVER) {
    case "pg":
      driver = createPgStorage(getDb());
      break;
    case "local":
      driver = createLocalStorage();
      break;
    case "s3":
      // The interface is the contract; wiring an S3 client is a deployment-time choice documented in the README.
      throw new Error("STORAGE_DRIVER=s3 is not bundled in this build; use pg or local");
  }
  return driver;
}

export type { StorageDriver } from "./types";
