/**
 * Verifies that ANTHROPIC_API_KEY in .env.local works for the configured model tiers.
 * Usage: npx tsx scripts/check-key.ts
 */
import { config } from "dotenv";
import Anthropic from "@anthropic-ai/sdk";

config({ path: ".env.local" });

const key = process.env.ANTHROPIC_API_KEY ?? "";
if (!key) {
  console.error("ANTHROPIC_API_KEY is not set in .env.local");
  process.exit(1);
}
console.log(`key: ${key.slice(0, 10)}… (${key.length} chars)`);

const models = [
  process.env.AI_MODEL_CHEAP ?? "claude-haiku-5-5",
  process.env.AI_MODEL_STRONG ?? "claude-sonnet-5-5",
];

async function main(): Promise<void> {
  const client = new Anthropic({ apiKey: key });
  let failed = false;
  for (const model of models) {
    const started = Date.now();
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 16,
        messages: [{ role: "user", content: "Reply with the single word OK." }],
      });
      const text = res.content[0]?.type === "text" ? res.content[0].text.trim() : "";
      console.log(`${model}: "${text}" in ${Date.now() - started} ms (${res.usage.input_tokens} in / ${res.usage.output_tokens} out)`);
    } catch (err) {
      failed = true;
      const e = err as { status?: number; message?: string };
      console.log(`${model}: FAILED ${e.status ?? ""} ${e.message?.slice(0, 300) ?? ""}`);
    }
  }
  process.exit(failed ? 1 : 0);
}

void main();
