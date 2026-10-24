import { describe, expect, it } from "vitest";
import { assertedIn, claimCoverage, contentStems, contradictedPhrase, deniesTerm, lexiconTermsIn, negatedPhrases, stem } from "./claim-support";
import { CLAIM_LEXICON } from "./lexicon";
import { tokenizeClauses } from "./negation";

function entry(term: string) {
  const e = CLAIM_LEXICON.find((x) => x.term === term);
  if (!e) throw new Error(`no lexicon entry ${term}`);
  return e;
}

describe("stem / contentStems", () => {
  it.each([
    ["planters", "planter"],
    ["glazed", "glaz"],
    ["glaze", "glaz"],
    ["washing", "wash"],
    ["40", "40"],
  ])("%j → %j", (word, expected) => {
    expect(stem(word)).toBe(expected);
  });

  it("drops stopwords and negations", () => {
    expect(contentStems("Not suitable for the dishwasher")).toEqual(["suitabl", "dishwasher"]);
  });
});

describe("claimCoverage", () => {
  it.each([
    ["EC-D2: a claim in its quote's words", "Hand-thrown planter", "Hand-thrown terracotta planter", 1],
    ["EC-D2: a claim its quote does not say", "Suitable for year-round outdoor use", "Glazed inside", 0],
    ["EC-D2: a lexicon term proven in another language", "Dishwasher-safe", "Spülmaschinenfest", 1],
    ["EC-D2: half the words is half the coverage", "Drainage hole and saucer", "with drainage hole", 2 / 3],
    ["empty claim", "", "anything", 1],
  ])("%s", (_name, claim, quote, expected) => {
    expect(claimCoverage(claim, quote)).toBeCloseTo(expected, 5);
  });
});

describe("lexiconTermsIn", () => {
  it.each([
    ["100% organic cotton cover", ["organic"]],
    ["Fully weatherproof and winter-hardy", ["frost-proof"]],
    ["Safe for kids", ["child-safe"]],
    ["UV-stable, scratch-proof", ["uv-resistant", "scratch-resistant"]],
    ["Bio-based plastic", []],
    ["Made in Portugal", []],
  ])("EC-D2: %j names %j", (text, expected) => {
    expect(lexiconTermsIn(text)).toEqual(expected);
  });
});

describe("deniesTerm", () => {
  it.each([
    ["EC-B15: contraction", "This pot isn't frost-proof.", "frost-proof", true],
    ["EC-B15: auxiliary contraction", "Glaze doesn't make it dishwasher safe; hand wash only.", "dishwasher-safe", true],
    ["EC-B15: post-positioned answer", "Dishwasher-safe? No. Hand wash only.", "dishwasher-safe", true],
    ["EC-B15: labelled answer", "Dishwasher safe: no", "dishwasher-safe", true],
    ["EC-B15: ruled-out use", "Not suitable for dishwasher or microwave", "microwave-safe", true],
    ["EC-B15: the term's own spelling decides over its paraphrase", "Frost-resistant (not frost-proof, bring indoors below 0 °C)", "frost-proof", true],
    ["EC-B15: frost-resistant survives its neighbour's negation", "Frost-resistant (not frost-proof, bring indoors below 0 °C)", "frost-resistant", false],
    ["EC-B15: German nicht", "Nicht spülmaschinenfest", "dishwasher-safe", true],
    ["EC-B15: French n'est pas", "Ce bol n'est pas compatible lave-vaisselle.", "dishwasher-safe", true],
    ["an assertion is not a denial", "Dishwasher safe, no lid", "dishwasher-safe", false],
    ["a different use is not denied", "Not suitable for microwave; dishwasher safe", "dishwasher-safe", false],
    ["silence is not a denial", "Stoneware mug", "dishwasher-safe", false],
  ])("%s: %j denies %s → %s", (_name, text, term, expected) => {
    expect(deniesTerm(tokenizeClauses(text), entry(term))).toBe(expected);
  });

  it("assertedIn finds an un-negated occurrence", () => {
    const tokens = tokenizeClauses("Weatherproof glaze, not frost-proof");
    expect(assertedIn(tokens, "weatherproof")).toBe(true);
    expect(assertedIn(tokens, "frost proof")).toBe(false);
  });
});

describe("negatedPhrases / contradictedPhrase", () => {
  it("reads what a negation governs, forwards and back from a bare answer", () => {
    expect(negatedPhrases(tokenizeClauses("Not suitable for outdoor use")).map((p) => p.stems)).toEqual([["outdoor", "use"]]);
    expect(negatedPhrases(tokenizeClauses("Dishwasher-safe? No.")).map((p) => p.stems)).toEqual([["dishwasher", "safe"]]);
    expect(negatedPhrases(tokenizeClauses("Not included"))).toEqual([]);
  });

  it.each([
    ["EC-B15: a claim asserting the denied phrase", "Frost-proof down to -10°C", "Frost-resistant (not frost-proof, bring indoors below 0 °C)", true],
    ["EC-B15: a non-lexicon phrase", "Suitable for outdoor use", "Not suitable for outdoor use.", true],
    ["EC-B15: a faithful denial", "Not suitable for outdoor use", "Not suitable for outdoor use.", false],
    ["EC-B15: the source also asserts it elsewhere", "Outdoor use", "Outdoor use in summer. Not for outdoor use in winter.", false],
    ["an unrelated claim", "Hand-thrown planter", "Not frost-proof.", false],
  ])("%s", (_name, claim, source, expected) => {
    expect(contradictedPhrase(claim, tokenizeClauses(source)) !== null).toBe(expected);
  });
});
