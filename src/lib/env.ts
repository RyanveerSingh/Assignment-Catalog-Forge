import { config } from "dotenv";

/**
 * Load `.env.local` (secrets, never committed) and then `.env` (local defaults) for processes that
 * Next.js does not boot: the worker, migrations, drizzle-kit, scripts and tests. The first file
 * that defines a variable wins, so `.env.local` overrides `.env`. Variables already present in the
 * environment (for example on Render) are never overridden.
 */
config({ path: [".env.local", ".env"], quiet: true });
