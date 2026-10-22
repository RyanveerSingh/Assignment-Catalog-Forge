# CatalogForge — conventions for anyone (human or AI) working in this repo

Read `docs/PLAN.md` for the architecture and `EDGE-CASES.md` for the behaviour catalogue. This file is the short list of rules that keep the codebase coherent.

## Layout

- `src/core/**` is **pure TypeScript**: no filesystem, database, network, environment or clock access. `node:crypto` and `node:buffer` are allowed. Everything here is unit-tested with Vitest.
- `src/db` (Drizzle schema, migrations, repositories), `src/queue` (Postgres job queue), `src/jobs` (job handlers), `src/worker` (loop), `src/providers` (AI and storage drivers), `src/lib` (config, logger, event bus), `src/app` (Next.js routes), `src/components` (UI).
- Shared domain types live in `src/core/types.ts`. Import them; do not redeclare equivalents.

## Code rules

- TypeScript strict. No `any`; use `unknown` and narrow. No non-null assertions outside tests.
- Named exports only. One concern per file. Keep files under ~400 lines.
- Core cleaning/parsing functions **never throw on bad input**. They return a result plus `Issue[]`. Throw only for programmer errors (wrong types, impossible states).
- Money is integer cents + ISO currency. Never a float. Lengths are cm (1 dp), weights are integer grams.
- Comments explain *why*, briefly. No narrating what the code does.
- No `console.*` outside `scripts/`. Use `getLogger()` from `src/lib/logger`.
- Dates in the DB are `timestamptz`; in code they are `Date` or epoch ms, never strings.
- Every table has `store_id`; every repository function takes a `storeId` first.

## Tests

- Vitest, colocated: `foo.ts` + `foo.test.ts`.
- Name tests after the edge case they prove when one applies: `it("EC-B5: parses '1.299,00 €' as 129900 EUR")`. The ID comes from `EDGE-CASES.md`. A status there may only be flipped to ✅ when such a test exists.
- Table-driven tests (`it.each`) for parsers. Cover the happy path, the messy path and the empty/placeholder path.
- Integration tests that need Postgres read `DATABASE_URL` and `describe.skipIf(!process.env.DATABASE_URL)`.

## Commands

- `npm run check` = typecheck + lint + tests. Run it before saying a task is done.
- `npm run test -- src/core/clean` runs a subset.
- `docker compose up -d postgres` for a local database. `npm run db:migrate` applies migrations.

## Git

- Conventional commits: `feat(core): …`, `fix(queue): …`, `docs: …`, `chore: …`, `test: …`.
- Subagents do not commit; the main session reviews and commits.
- Never commit `.env.local` or anything under `samples/private/`.

## When you finish a module

1. `npm run check` passes.
2. Update the relevant rows in `EDGE-CASES.md`: ⬜ → ✅ when a named test exists, ⬜ → 🟡 when implemented without a test, and adjust the counts line at the top.
3. Report: files touched, tests added (count), EC IDs covered, anything you could not do and why.
