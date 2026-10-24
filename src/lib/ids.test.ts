import { describe, expect, it } from "vitest";
import { isUuid, optionalUuidQuery, requireUuidParam, uuidQueryList } from "./ids";

const ID = "0b9f3c3e-6a4d-4a8e-9a63-2f1f6a0c9d11";

describe("isUuid", () => {
  it.each([ID, ID.toUpperCase(), "00000000-0000-0000-0000-000000000000"])("accepts %s", (v) => {
    expect(isUuid(v)).toBe(true);
  });

  it.each(["notauuid", "abc", "", "x", `${ID} `, ` ${ID}`, `${ID}0`, ID.replace(/-/g, ""), "0b9f3c3e-6a4d-4a8e-9a63-2f1f6a0c9d1g", "'; drop table products; --"])("rejects %j", (v) => {
    expect(isUuid(v)).toBe(false);
  });

  it.each([null, undefined, 42, {}])("rejects the non-string %j", (v) => {
    expect(isUuid(v)).toBe(false);
  });
});

describe("requireUuidParam", () => {
  it("EC-I1: returns a valid id unchanged", () => {
    expect(requireUuidParam(ID, "product_not_found", "Product not found")).toBe(ID);
  });

  it("EC-I1: a malformed path id is a 404 with the route's own code, never a 500 from the uuid cast", () => {
    expect(() => requireUuidParam("notauuid", "product_not_found", "Product not found")).toThrow(expect.objectContaining({ status: 404, code: "product_not_found", message: "Product not found" }));
  });
});

describe("optionalUuidQuery", () => {
  it.each([null, ""])("treats %j as absent", (v) => {
    expect(optionalUuidQuery(v, "importId")).toBeUndefined();
  });

  it("returns a valid id", () => {
    expect(optionalUuidQuery(ID, "importId")).toBe(ID);
  });

  it("EC-I1: a malformed query id is a 400 naming the parameter", () => {
    expect(() => optionalUuidQuery("abc", "importId")).toThrow(expect.objectContaining({ status: 400, code: "invalid_id", message: "importId must be a UUID" }));
  });
});

describe("uuidQueryList", () => {
  it("passes a list of valid ids through", () => {
    expect(uuidQueryList([ID, ID.toUpperCase()], "id")).toEqual([ID, ID.toUpperCase()]);
  });

  it("accepts an empty list", () => {
    expect(uuidQueryList([], "id")).toEqual([]);
  });

  it("EC-I1: one malformed id rejects the whole request with 400", () => {
    expect(() => uuidQueryList([ID, "x"], "id")).toThrow(expect.objectContaining({ status: 400, code: "invalid_id" }));
  });
});
