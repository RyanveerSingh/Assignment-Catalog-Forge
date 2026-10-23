import { describe, expect, it } from "vitest";
import { pickCategoryPhoto, type CategoryPhoto } from "./category-photos";

const photo = (category: string, imageId: string, updatedAtMs: number): CategoryPhoto => ({ category, imageId, thumbId: `${imageId}-thumb`, alt: "", updatedAtMs });

const PHOTOS = [
  photo("Home & Garden > Decor > Clocks", "clock", 10),
  photo("Home & Garden > Decor > Vases", "vase", 30),
  photo("Home & Garden > Kitchen & Dining > Food Storage", "jar", 20),
  photo("Furniture > Outdoor Furniture", "bench", 5),
];

describe("pickCategoryPhoto", () => {
  it("returns the exact category's photo for a leaf", () => {
    expect(pickCategoryPhoto(PHOTOS, "Home & Garden > Decor > Clocks")?.imageId).toBe("clock");
  });

  it("borrows the newest photo beneath a family or a middle level", () => {
    expect(pickCategoryPhoto(PHOTOS, "Home & Garden")?.imageId).toBe("vase");
    expect(pickCategoryPhoto(PHOTOS, "Home & Garden > Kitchen & Dining")?.imageId).toBe("jar");
  });

  it("does not match a sibling that merely shares a prefix string", () => {
    expect(pickCategoryPhoto([photo("Furniture Covers > Sofa", "cover", 1)], "Furniture")).toBeNull();
  });

  it("returns null when nothing beneath the path has a photo", () => {
    expect(pickCategoryPhoto(PHOTOS, "Toys")).toBeNull();
    expect(pickCategoryPhoto([], "Furniture")).toBeNull();
  });
});
