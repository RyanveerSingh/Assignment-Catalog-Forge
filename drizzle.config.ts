import "./src/lib/env";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://catalogforge:catalogforge@localhost:5432/catalogforge",
  },
  strict: true,
  verbose: false,
});
