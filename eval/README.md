# Evaluation harness

Runs a sample sheet through the real pipeline pieces (parse → map columns → clean → group → AI enrichment in batches of eight → grounding validator), compares the result with the ground truth generated alongside the sample, prints a report and writes a JSON file. Nothing is written to the products tables.

```
npx tsx eval/run.ts --sample messy-120 [--provider mock|anthropic] [--prompt v1] [--tier auto|cheap|strong] [--limit N] [--store[=<storeId>]] [--out <dir>] [--quiet]
npm run eval -- --sample tiny-10 --provider mock
```

| Flag | Default | Meaning |
|---|---|---|
| `--sample` | `messy-120` | `samples/<name>.csv` (or `.xlsx` when there is no CSV) plus `samples/ground-truth/<name>.json`. |
| `--provider` | `mock` | `anthropic` needs `ANTHROPIC_API_KEY` in `.env.local` (with `AI_PROVIDER=anthropic`); without it the run falls back to the mock and says so in the header. `mock` always runs the mock, even when the server is configured for Anthropic. |
| `--prompt` | `v1` | Prompt version handed to `buildEnrichSystemPrompt`. |
| `--tier` | `auto` | `auto` routes each product with `routeTier` like the pipeline; `cheap`/`strong` force one model for every product. |
| `--limit` | all | Only the first N products in sheet order; the ground truth is narrowed to the same rows so recall stays meaningful. |
| `--store` | off | Also insert one row into `eval_runs` (`store_id` null, or the id given as `--store=<uuid>` so it shows in that store's Metrics tab). Skipped with a message when `DATABASE_URL` is unset or the database is unreachable. |
| `--out` | `eval/out` | Where the JSON goes; the directory is git-ignored. |

The exit code is 1 when `negated violations` is above zero, 0 otherwise. Every other metric is informational.

Model calls use the same request shape as `src/jobs/enrich.ts` (purpose `enrich`, 12 000 max tokens, effort `low` for the cheap tier and `medium` otherwise). A failed call is retried up to three times with a two-second backoff; a batch whose answer skips or mislabels products is split into single-product calls once. A product that still has no usable answer is kept with `status: "failed"` and counts against every rate.

## Output

- Terminal: header (sample, provider, model, prompt, product and call counts), the metrics table, the ten worst products with their failing checks, then cost and latency.
- `eval/out/<sample>-<provider>-<model>-<prompt>-<timestamp>.json`: the config, the metrics, one `PairScore` per matched product (every count behind each rate, the missing keywords, disallowed claims, price misses, violations), unmatched products on both sides, routing per product, duplicate rows, one record per model call (tokens, cost, latency, error) and the cost summary.

## Metrics

Products are paired by shared SKUs (most shared wins, each truth product used once); an equal product key breaks ties and rescues the SKU-less row whose truth SKU is `""`. SKUs compare upper-cased and trimmed, so a synthetic `GEN-…` SKU never matches. Rates are fractions 0–1, or `n/a` when there was nothing to score.

| Metric | What it measures |
|---|---|
| product recall / precision | Matched pairs over truth products / over derived products. A product the grouper split in two shows up as one match plus one unmatched derived product. |
| variant precision / recall | Derived SKUs that exist in the truth / truth SKUs the pipeline recovered. Denominators include the variants of unmatched products, so a dropped product costs recall and an invented one costs precision. |
| price exactness | Truth variants whose matched variant has the identical `priceCents` and `currency` (`null` must meet `null`; `0` is not `null`). Over all truth variants. |
| title keyword rate | Mean, per product, of the share of `titleKeywords` found in the lower-cased output title. |
| category accuracy | Output category starts with `categoryPrefix`, case-insensitive. |
| claim precision | Output claims (after grounding) that sit inside `allowedClaims`. Claims compare after lower-casing and hyphen/space folding; a claim counts when all of its words appear in one allowed claim or vice versa (`organic` is inside `100% organic cotton`). Micro-averaged over all claims. |
| claim recall | `allowedClaims` covered by some output claim, same comparison. Bounded by what the model cites and by the claim lexicon in `src/core/ai/lexicon.ts`; phrases outside it (`40 hour burn time`) can only be recalled when the model cites them. |
| negated violations | Count of output claims that assert a `negatedClaims` entry (or part of one, or its joined spelling such as `frostproof`), plus every occurrence of a negated phrase in the title, description, tags or attributes that is not itself negated within the three preceding tokens (`not frost-proof` in a restored care sentence is fine). Must be 0. |
| review precision / recall | `needs_review` as the positive class, over matched pairs: flags that were expected / expected flags that happened. |
| review reason hit | For products expected in review with a reason class: `no_price` needs a reason containing "price", `sku_conflict` one containing "conflict". |
| status accuracy | `draft` ↔ `done` and `needs_review` ↔ `needs_review`; a failed product is never correct. |
| duplicate precision / recall | `{row, of}` pairs the grouper reported versus the truth's `duplicateRows`. |
| confidence when correct / wrong | Mean title confidence (0–100 scaled to a fraction) for products whose title keyword hit is at least 0.5 versus below. A calibrated model is confident when right and hesitant when wrong. |

Per-product scoring lives in `eval/metrics.ts` and is pure; `eval/metrics.test.ts` pins each rule with an EC id where one applies.

## Adding labelled products

The ground truth is a `GroundTruthFile` (`src/core/types.ts`). The committed files are generated by `npm run samples` from the templates in `scripts/lib/catalog.ts`; regenerating with the same seed reproduces them byte for byte, so edits by hand to a generated file are lost on the next run. To label more products:

1. Add a template to `scripts/lib/catalog.ts` (title keywords, category prefix, allowed and negated claims come from the template's notes) and regenerate, or
2. Create a new sample pair: `samples/<name>.csv` and `samples/ground-truth/<name>.json` with one `GroundTruthProduct` per product. Keep `sourceRows` and `duplicateRows` covering every data row exactly once; list `variants[].sku` exactly as the sheet spells it (upper-casing is applied on both sides); write `titleKeywords`, `allowedClaims` and `negatedClaims` in lower-case English; use `expectedStatus: "needs_review"` with `expectedReviewReasons` (`no_price`, `sku_conflict`) whenever the sheet gives the validator a reason to stop.

Then `npx tsx eval/run.ts --sample <name>`.

## A/B testing prompts and models

Run the same sample twice with different flags and compare the JSON files:

```
npx tsx eval/run.ts --sample messy-120 --provider anthropic --prompt v1
npx tsx eval/run.ts --sample messy-120 --provider anthropic --prompt v2
npx tsx eval/run.ts --sample messy-120 --provider anthropic --tier cheap
npx tsx eval/run.ts --sample messy-120 --provider anthropic --tier strong
```

Each run names its file after the sample, provider, model, prompt and timestamp. `metrics` is the summary to diff; `products[]` tells you which product moved and why; `cost` carries tokens, dollars and latency so an accuracy gain can be weighed against its price. With `--store` the summary also lands in `eval_runs`, and the Metrics tab lists stored runs by prompt version and model (pass `--store=<storeId>` for the store whose tab should show it).

The mock provider is deterministic and free, so it is the right baseline for checking that the deterministic stages and the grounding validator behave; its listings are naive on purpose (it copies source text, does not translate and claims whatever the lexicon finds), so compare mock runs with mock runs and model runs with model runs.
