import { describe, expect, it } from "vitest";
import { protectText, verifyAndRestore } from "./protect";

describe("protectText / verifyAndRestore", () => {
  it("EC-G1: protects tags, placeholders, numbers with units and SKUs", () => {
    const p = protectText('<p>Planter <strong>TC-PL-20</strong>, 20 cm, {{count}} left, 1.299,00 EUR</p>', ["Acme"]);
    expect(p.tokens).toEqual(["<p>", "<strong>", "TC-PL-20", "</strong>", "20 cm", "{{count}}", "1.299,00", "</p>"]);
    expect(p.text).toBe("⟦1⟧Planter ⟦2⟧⟦3⟧⟦4⟧, ⟦5⟧, ⟦6⟧ left, ⟦7⟧ EUR⟦8⟧");
  });

  it("EC-G2: glossary terms are protected as whole words", () => {
    const p = protectText("Apple planter by Apple Garden", ["Apple Garden", "Apple"]);
    expect(p.tokens).toEqual(["Apple", "Apple Garden"]);
  });

  it("restores a faithful translation", () => {
    const p = protectText("<p>Planter 20 cm</p>");
    const r = verifyAndRestore("⟦1⟧Übertopf ⟦2⟧⟦3⟧", p);
    expect(r.ok).toBe(true);
    expect(r.restored).toBe("<p>Übertopf 20 cm</p>");
  });

  it("EC-G1: rejects a translation that drops or duplicates a placeholder", () => {
    const p = protectText("<p>Planter 20 cm</p>");
    expect(verifyAndRestore("⟦1⟧Übertopf⟦3⟧", p).problems[0]).toMatch(/placeholder 2 .* missing/);
    expect(verifyAndRestore("⟦1⟧Übertopf ⟦2⟧ ⟦2⟧⟦3⟧", p).problems[0]).toMatch(/appears 2 times/);
    expect(verifyAndRestore("⟦1⟧Übertopf ⟦2⟧⟦3⟧⟦9⟧", p).ok).toBe(false);
  });

  it("EC-G4: rejects a translation that reorders tags", () => {
    const p = protectText("<p><strong>Hot</strong> item</p>");
    expect(verifyAndRestore("⟦1⟧⟦3⟧Heiß⟦2⟧ Artikel⟦4⟧", p).problems).toEqual(["HTML tag sequence changed"]);
  });
});
