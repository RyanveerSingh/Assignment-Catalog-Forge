import { describe, expect, it } from "vitest";
import { DISMISS_REASON, nextPhotoPosition, planAssign, planDismiss, planRestore } from "./manual";

const product = { id: "p1", deletedAt: null };

describe("nextPhotoPosition", () => {
  it.each([
    [[], 0],
    [[0], 1],
    [[0, 1, 2], 3],
    [[0, 5], 6],
    [[3, 1], 4],
    [[Number.NaN, 2], 3],
  ])("EC-C13: %j → %i", (positions, expected) => {
    expect(nextPhotoPosition(positions)).toBe(expected);
  });
});

describe("planAssign", () => {
  it("EC-C13: an unmatched photo is assigned by hand with method manual, score 100, after the existing photos", () => {
    const r = planAssign({ status: "unmatched", productId: null }, product, [0, 1]);
    expect(r).toEqual({ ok: true, patch: { productId: "p1", variantId: null, position: 2, matchMethod: "manual", matchScore: 100, status: "matched", rejectReason: null } });
  });

  it("EC-C13: a dismissed photo can be assigned directly and loses its reject reason", () => {
    const r = planAssign({ status: "rejected", productId: null }, product, []);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.patch.position).toBe(0);
      expect(r.patch.rejectReason).toBeNull();
    }
  });

  it("EC-C13: a photo that already belongs to a product is refused", () => {
    expect(planAssign({ status: "matched", productId: "other" }, product, [])).toEqual({ ok: false, code: "already_assigned", message: expect.any(String) });
  });

  it.each([
    ["missing photo", null, product, "not_found"],
    ["missing product", { status: "unmatched" as const, productId: null }, null, "product_not_found"],
    ["deleted product", { status: "unmatched" as const, productId: null }, { id: "p1", deletedAt: new Date() }, "product_deleted"],
  ])("EC-C13: refuses on %s", (_name, photo, target, code) => {
    const r = planAssign(photo, target, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(code);
  });
});

describe("planDismiss / planRestore", () => {
  it("EC-C13: dismissing marks the photo rejected with a merchant reason", () => {
    expect(planDismiss({ status: "unmatched", productId: null })).toEqual({ ok: true, patch: { status: "rejected", rejectReason: DISMISS_REASON } });
  });

  it("EC-C13: dismissing twice is a no-op patch, not an error", () => {
    expect(planDismiss({ status: "rejected", productId: null }).ok).toBe(true);
  });

  it("EC-C13: an assigned photo cannot be dismissed from the tray", () => {
    const r = planDismiss({ status: "matched", productId: "p1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("already_assigned");
  });

  it("EC-C13: restore puts a dismissed photo back in the unmatched tray", () => {
    expect(planRestore({ status: "rejected", productId: null })).toEqual({ ok: true, patch: { status: "unmatched", rejectReason: null } });
  });

  it.each([
    ["unmatched", { status: "unmatched" as const, productId: null }, "not_dismissed"],
    ["matched", { status: "matched" as const, productId: "p1" }, "not_dismissed"],
    ["missing", null, "not_found"],
  ])("EC-C13: restore refuses a %s photo", (_name, photo, code) => {
    const r = planRestore(photo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe(code);
  });
});
