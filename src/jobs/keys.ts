/** Deterministic job keys: re-driving an import re-enqueues the same keys, which the queue ignores (EC-E1). */
export const jobKeys = {
  drive: (importId: string) => `import:${importId}:drive`,
  ingest: (importId: string) => `import:${importId}:ingest`,
  clean: (importId: string, chunk: number) => `import:${importId}:clean:${chunk}`,
  group: (importId: string) => `import:${importId}:group`,
  photos: (importId: string) => `import:${importId}:photos`,
  enrich: (batchKey: string) => batchKey,
  batchSubmit: (importId: string, tier: string) => `import:${importId}:batch:${tier}:submit`,
  batchPoll: (importId: string, batchId: string) => `import:${importId}:batch:${batchId}:poll`,
  translate: (productId: string) => `product:${productId}:translate`,
  finalize: (importId: string) => `import:${importId}:finalize`,
  publish: (productId: string) => `product:${productId}:publish`,
  webhook: (deliveryId: string) => `webhook:${deliveryId}`,
};

export const JOB_TYPES = {
  ingest: "import.ingest",
  clean: "rows.clean",
  group: "import.group",
  photos: "import.photos",
  enrich: "products.enrich",
  batchSubmit: "import.batch.submit",
  batchPoll: "import.batch.poll",
  translate: "products.translate",
  finalize: "import.finalize",
  publish: "products.publish",
  webhook: "webhook.deliver",
} as const;

/** Small imports jump the queue so a 10-row upload is never stuck behind a 10k one (EC-E5). */
export function priorityFor(totalRows: number): number {
  if (totalRows <= 200) return 40;
  if (totalRows <= 2_000) return 70;
  return 100;
}
