import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { parseRetryAfter, retryAfterFromResponse } from "./retry-after";

describe("parseRetryAfter", () => {
  test("parses the delta-seconds form into milliseconds", () => {
    const result = parseRetryAfter("120");
    assert.equal(result.form, "delta-seconds");
    assert.equal(result.delayMs, 120_000);
  });

  test("treats delta-seconds of 0 as a zero delay, not unparseable", () => {
    const result = parseRetryAfter("0");
    assert.equal(result.form, "delta-seconds");
    assert.equal(result.delayMs, 0);
  });

  test("parses the HTTP-date form relative to a supplied clock", () => {
    const now = () => Date.parse("Wed, 21 Oct 2015 07:28:00 GMT");
    const result = parseRetryAfter("Wed, 21 Oct 2015 07:30:00 GMT", now);
    assert.equal(result.form, "http-date");
    assert.equal(result.delayMs, 120_000);
  });

  test("clamps an HTTP-date already in the past to a zero delay", () => {
    const now = () => Date.parse("Wed, 21 Oct 2015 08:00:00 GMT");
    const result = parseRetryAfter("Wed, 21 Oct 2015 07:30:00 GMT", now);
    assert.equal(result.form, "http-date");
    assert.equal(result.delayMs, 0);
  });

  test("returns null-form, zero-delay for a missing value", () => {
    assert.deepEqual(parseRetryAfter(null), { delayMs: 0, form: null });
    assert.deepEqual(parseRetryAfter(undefined), { delayMs: 0, form: null });
  });

  test("returns null-form, zero-delay for an empty or whitespace value", () => {
    assert.deepEqual(parseRetryAfter(""), { delayMs: 0, form: null });
    assert.deepEqual(parseRetryAfter("   "), { delayMs: 0, form: null });
  });

  test("returns null-form, zero-delay for garbage input rather than throwing", () => {
    assert.deepEqual(parseRetryAfter("not-a-valid-header"), { delayMs: 0, form: null });
  });

  test("rejects a negative delta-seconds value as unparseable rather than a negative delay", () => {
    assert.deepEqual(parseRetryAfter("-5"), { delayMs: 0, form: null });
  });
});

describe("retryAfterFromResponse", () => {
  test("reads and parses the Retry-After header straight off a Response", () => {
    const response = new Response(null, { status: 429, headers: { "Retry-After": "30" } });
    const result = retryAfterFromResponse(response);
    assert.equal(result.form, "delta-seconds");
    assert.equal(result.delayMs, 30_000);
  });

  test("returns null-form when the response has no Retry-After header", () => {
    const response = new Response(null, { status: 429 });
    const result = retryAfterFromResponse(response);
    assert.deepEqual(result, { delayMs: 0, form: null });
  });
});
