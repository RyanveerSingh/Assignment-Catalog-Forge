import { EventEmitter } from "node:events";

/**
 * In-process event bus. In embedded worker mode the web server hears job progress directly;
 * in separate-process mode SSE clients fall back to polling `import_events`, so nothing here is
 * load-bearing for correctness, only for latency.
 */

export interface ImportProgressEvent {
  importId: string;
  storeId: string;
  status: string;
  counts: { pending: number; processing: number; done: number; needs_review: number; failed: number };
  totalRows: number;
  productCount: number;
  pausedUntil: string | null;
  pauseReason: string | null;
}

export interface ImportLogEvent {
  importId: string;
  id: number;
  level: "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

interface BusEvents {
  "import:progress": [ImportProgressEvent];
  "import:log": [ImportLogEvent];
  "queue:wake": [];
}

class TypedBus extends EventEmitter<BusEvents> {}

declare global {
  var __catalogforgeBus: TypedBus | undefined;
}

/** Singleton across Next.js hot reloads and across the embedded worker. */
export function getBus(): TypedBus {
  if (!globalThis.__catalogforgeBus) {
    const bus = new TypedBus();
    bus.setMaxListeners(200);
    globalThis.__catalogforgeBus = bus;
  }
  return globalThis.__catalogforgeBus;
}

/** Ask the worker loop (if it lives in this process) to poll immediately. */
export function wakeWorker(): void {
  getBus().emit("queue:wake");
}
