import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "eval/**/*.test.ts", "scripts/**/*.test.ts"],
    // Integration tests that need Postgres read DATABASE_URL and skip themselves when it is unset.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: { LOG_LEVEL: "silent" },
    // Integration suites share one database; run files one at a time to keep them from clearing each other's rows.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
