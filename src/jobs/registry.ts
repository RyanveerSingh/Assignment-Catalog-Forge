import type { QueueName } from "@/db/schema";
import type { JobHandler } from "@/worker/loop";

/**
 * Every job type the worker knows about. Handlers are registered here as the pipeline stages land.
 * Keep the map explicit (no dynamic imports) so a typo in a job type fails at build time.
 */
export function buildHandlers(): Record<string, JobHandler> {
  return {};
}

export const QUEUE_LAYOUT: Array<{ name: QueueName; concurrency: number }> = [
  { name: "default", concurrency: 2 },
  { name: "ai", concurrency: 4 },
  { name: "translate", concurrency: 2 },
  { name: "maintenance", concurrency: 1 },
];

/** Called when a job is dead: mark whatever it owned as Failed with a reason so counts still add up (EC-E9). */
export async function onJobDead(): Promise<void> {
  // Filled in by the import pipeline once rows/products exist.
}

/** Reconciler tick: re-enqueue missing work for active imports, reset stuck rows (EC-E10). */
export async function onWorkerTick(): Promise<void> {
  // Filled in by the import pipeline.
}
