import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boundedEditDistance, fuzzyMatchWord, maxTypoDistance } from "@/lib/search/fuzzy";

describe("maxTypoDistance", () => {
  it("gives short queries zero tolerance", () => {
    assert.equal(maxTypoDistance(1), 0);
    assert.equal(maxTypoDistance(3), 0);
  });

  it("gives medium queries one edit of tolerance", () => {
    assert.equal(maxTypoDistance(4), 1);
    assert.equal(maxTypoDistance(7), 1);
  });

  it("gives long queries two edits of tolerance", () => {
    assert.equal(maxTypoDistance(8), 2);
    assert.equal(maxTypoDistance(20), 2);
  });
});

describe("boundedEditDistance", () => {
  it("is zero for identical strings", () => {
    assert.equal(boundedEditDistance("kraken", "kraken", 5), 0);
  });

  it("counts a single substitution", () => {
    assert.equal(boundedEditDistance("kraken", "kraaen", 5), 1);
  });

  it("counts a single insertion (extra letter — the classic double-letter typo)", () => {
    assert.equal(boundedEditDistance("lobstr", "lobstrr", 5), 1);
  });

  it("counts a single deletion (missing letter)", () => {
    assert.equal(boundedEditDistance("soroswap", "sorosap", 5), 1);
  });

  it("counts an adjacent transposition as a single edit", () => {
    assert.equal(boundedEditDistance("kraken", "karken", 5), 1);
  });

  it("returns bound+1 once the distance is certain to exceed the bound, without finishing the full table", () => {
    assert.equal(boundedEditDistance("completely", "different", 1), 2);
  });

  it("bounds early via the length-difference shortcut", () => {
    assert.equal(boundedEditDistance("a", "abcdefgh", 2), 3);
  });
});

describe("fuzzyMatchWord", () => {
  it("matches a one-letter-off word within tolerance", () => {
    const match = fuzzyMatchWord("kraken exchange", "kraaen");
    assert.ok(match);
    assert.equal(match?.word, "kraken");
    assert.equal(match?.distance, 1);
  });

  it("returns null for a short query even if a word is within edit distance", () => {
    // "cat" vs "car" is distance 1, but queries of length <= 3 get zero tolerance.
    assert.equal(fuzzyMatchWord("cat nap", "car"), null);
  });

  it("returns null when no word is within tolerance", () => {
    assert.equal(fuzzyMatchWord("kraken exchange", "zzzzzzz"), null);
  });

  it("returns null for an empty query", () => {
    assert.equal(fuzzyMatchWord("kraken exchange", ""), null);
  });

  it("picks the closest of multiple candidate words", () => {
    const match = fuzzyMatchWord("soroswap kraken", "krakn");
    assert.equal(match?.word, "kraken");
  });
});
