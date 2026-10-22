import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseRetryAfter } from "./rate-limit";

describe("parseRetryAfter", () => {
  it("parses delta-seconds, including zero and whitespace", () => {
    assert.equal(parseRetryAfter(" 15 "), 15_000);
    assert.equal(parseRetryAfter("0"), 0);
  });

  it("parses an HTTP-date relative to the current time", () => {
    const now = Date.parse("Wed, 21 Oct 2026 20:00:00 GMT");
    assert.equal(parseRetryAfter("Wed, 21 Oct 2026 20:00:05 GMT", now), 5_000);
    assert.equal(parseRetryAfter("Wed, 21 Oct 2026 19:59:59 GMT", now), 0);
  });

  it("accepts the older HTTP-date formats", () => {
    const now = Date.parse("Sun, 06 Nov 1994 08:49:30 GMT");
    assert.equal(parseRetryAfter("Sunday, 06-Nov-94 08:49:37 GMT", now), 7_000);
    assert.equal(parseRetryAfter("Sun Nov  6 08:49:37 1994", now), 7_000);
  });

  it("returns null for absent, invalid, or unsafe values", () => {
    for (const value of [null, "", "-2", "1.5", "tomorrow", "10/22/2026", "99999999999999999"]) {
      assert.equal(parseRetryAfter(value), null);
    }
  });
});
