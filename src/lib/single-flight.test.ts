import { describe, expect, it } from "vitest";
import { inflightCount, singleFlight } from "./single-flight";

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("singleFlight", () => {
  it("EC-H6: concurrent callers with the same key share one invocation", async () => {
    const gate = deferred<number>();
    let calls = 0;
    const fn = () => {
      calls++;
      return gate.promise;
    };
    const a = singleFlight("k1", fn);
    const b = singleFlight("k1", fn);
    const c = singleFlight("k1", fn);
    expect(calls).toBe(1);
    expect(inflightCount()).toBe(1);
    gate.resolve(42);
    await expect(Promise.all([a, b, c])).resolves.toEqual([42, 42, 42]);
    expect(inflightCount()).toBe(0);
  });

  it("runs again once the previous flight has settled", async () => {
    let calls = 0;
    const fn = async () => ++calls;
    await singleFlight("k2", fn);
    await singleFlight("k2", fn);
    expect(calls).toBe(2);
  });

  it("different keys do not share a flight", async () => {
    let calls = 0;
    const fn = async () => ++calls;
    await Promise.all([singleFlight("k3", fn), singleFlight("k4", fn)]);
    expect(calls).toBe(2);
  });

  it("a rejection reaches every waiter and clears the key", async () => {
    const gate = deferred<number>();
    const a = singleFlight("k5", () => gate.promise);
    const b = singleFlight("k5", () => gate.promise);
    gate.reject(new Error("boom"));
    await expect(a).rejects.toThrow("boom");
    await expect(b).rejects.toThrow("boom");
    expect(inflightCount()).toBe(0);
    await expect(singleFlight("k5", async () => "ok")).resolves.toBe("ok");
  });
});
