import { describe, expect, it } from "vitest";
import { storeInitial } from "./store-initial";

describe("storeInitial", () => {
  it.each([
    ["Demo Store", "D"],
    ["  élan boutique", "É"],
    ["ßtore", "SS"],
    ["🧵 Threads", "🧵"],
    ["", "?"],
    ["   ", "?"],
  ])("%j → %j", (name, expected) => {
    expect(storeInitial(name)).toBe(expected);
  });
});
