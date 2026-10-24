import { describe, expect, it } from "vitest";
import { capImportBudget, demoLocked, demoLockInfo, lockedSettingsChange, resolveDemoLockdown } from "./demo-lockdown";

const CURRENT = { locales: ["en", "de", "fr"], countryLocaleMap: { DE: "de", FR: "fr" } };

describe("resolveDemoLockdown", () => {
  it.each([
    [{}, false],
    [{ SEED_DEMO: "true" }, true],
    [{ SEED_DEMO: "false" }, false],
    [{ SEED_DEMO: "true", DEMO_LOCKDOWN: "false" }, false],
    [{ DEMO_LOCKDOWN: "true" }, true],
  ])("%j resolves to %s", (env, expected) => {
    expect(resolveDemoLockdown(env)).toBe(expected);
  });
});

describe("lockedSettingsChange", () => {
  it("allows ordinary edits and budgets up to the cap", () => {
    expect(lockedSettingsChange({ importBudgetCents: 200 }, CURRENT, 200)).toBeNull();
    expect(lockedSettingsChange({}, CURRENT, 200)).toBeNull();
  });

  it("refuses any API key change, including clearing it", () => {
    expect(lockedSettingsChange({ apiKey: "sk-ant-junk" }, CURRENT, 200)).toMatch(/API key/);
    expect(lockedSettingsChange({ apiKey: "" }, CURRENT, 200)).toMatch(/API key/);
  });

  it("refuses a budget above the cap and names the cap", () => {
    expect(lockedSettingsChange({ importBudgetCents: 100_000 }, CURRENT, 200)).toBe("the import budget is capped at $2.00");
  });

  it("re-sending the current languages and map is not a change", () => {
    expect(lockedSettingsChange({ locales: ["fr", "de"], countryLocaleMap: { FR: "fr", DE: "de" } }, CURRENT, 200)).toBeNull();
    expect(lockedSettingsChange({ locales: ["en", "de", "fr"] }, CURRENT, 200)).toBeNull();
  });

  it("refuses a changed language set or country map", () => {
    expect(lockedSettingsChange({ locales: ["de"] }, CURRENT, 200)).toMatch(/languages/);
    expect(lockedSettingsChange({ countryLocaleMap: { DE: "de" } }, CURRENT, 200)).toMatch(/country/);
    expect(lockedSettingsChange({ countryLocaleMap: { DE: "fr", FR: "fr" } }, CURRENT, 200)).toMatch(/country/);
  });
});

describe("capImportBudget", () => {
  it("keeps a budget within the cap", () => {
    expect(capImportBudget(150, 500, 200)).toEqual({ budgetCents: 150 });
  });

  it("clamps an explicit or default budget above the cap and says so", () => {
    expect(capImportBudget(100_000, 500, 200)).toEqual({ budgetCents: 200, warning: "Locked in the shared demo: the AI budget for this import was capped at $2.00" });
    expect(capImportBudget(undefined, 500, 200).budgetCents).toBe(200);
  });
});

describe("demo lock messages", () => {
  it("a locked action is a 403 with the shared prefix", () => {
    expect(demoLocked("the API key cannot be changed")).toMatchObject({ status: 403, code: "demo_locked", message: "Locked in the shared demo: the API key cannot be changed" });
  });

  it("the settings page gets the cap and what is locked", () => {
    expect(demoLockInfo(200)).toMatchObject({ budgetCapCents: 200, apiKey: true, languages: true, message: expect.stringContaining("$2.00") });
  });
});
