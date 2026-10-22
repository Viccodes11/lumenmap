import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  INVALID_COMPARISON_ADDRESS,
  SAME_ADDRESS_COMPARISON,
  buildCompareParam,
  computeCounterpartyOverlap,
  isValidComparisonAddress,
  parseCompareParam,
  resolveComparisonEntity,
  summarizeCategoryMix,
  validateComparisonAddresses,
  type EntityLookup,
} from "./address-comparison";
import type { EgoCounterparty } from "./flow-ego";

const ACCOUNT_A = "GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKTM";
const ACCOUNT_B = `G${"B".repeat(54)}3`;
const CONTRACT_A = "CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2";

function counterparty(id: string, category?: string): EgoCounterparty {
  return { id, label: id, category, outflow: BigInt(0), inflow: BigInt(0), operationCount: 1 };
}

describe("isValidComparisonAddress", () => {
  it("accepts a valid account or contract address", () => {
    assert.equal(isValidComparisonAddress(ACCOUNT_A), true);
    assert.equal(isValidComparisonAddress(CONTRACT_A), true);
  });

  it("rejects garbage input", () => {
    assert.equal(isValidComparisonAddress("not-an-address"), false);
    assert.equal(isValidComparisonAddress(""), false);
  });
});

describe("validateComparisonAddresses", () => {
  it("accepts two distinct valid addresses", () => {
    const result = validateComparisonAddresses(ACCOUNT_A, ACCOUNT_B);
    assert.deepEqual(result, { ok: true });
  });

  it("rejects an invalid address A with a clear, specific error", () => {
    const result = validateComparisonAddresses("not-an-address", ACCOUNT_B);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.error.startsWith("Address A:"));
    if (!result.ok) assert.ok(result.error.includes(INVALID_COMPARISON_ADDRESS));
  });

  it("rejects an invalid address B with a clear, specific error", () => {
    const result = validateComparisonAddresses(ACCOUNT_A, "not-an-address");
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.error.startsWith("Address B:"));
  });

  it("rejects comparing an address against itself", () => {
    const result = validateComparisonAddresses(ACCOUNT_A, ACCOUNT_A);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, SAME_ADDRESS_COMPARISON);
  });

  it("rejects a self-comparison even with surrounding whitespace", () => {
    const result = validateComparisonAddresses(ACCOUNT_A, ` ${ACCOUNT_A} `);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, SAME_ADDRESS_COMPARISON);
  });
});

describe("parseCompareParam / buildCompareParam", () => {
  it("round-trips two addresses through the URL param", () => {
    const param = buildCompareParam(ACCOUNT_A, CONTRACT_A);
    assert.deepEqual(parseCompareParam(param), [ACCOUNT_A, CONTRACT_A]);
  });

  it("parses a well-formed param into a pair", () => {
    assert.deepEqual(parseCompareParam(`${ACCOUNT_A},${CONTRACT_A}`), [ACCOUNT_A, CONTRACT_A]);
  });

  it("returns null for a missing or empty param", () => {
    assert.equal(parseCompareParam(null), null);
    assert.equal(parseCompareParam(undefined), null);
    assert.equal(parseCompareParam(""), null);
  });

  it("returns null for a malformed param (wrong number of parts)", () => {
    assert.equal(parseCompareParam(ACCOUNT_A), null);
    assert.equal(parseCompareParam(`${ACCOUNT_A},${CONTRACT_A},extra`), null);
  });

  it("trims whitespace around each address", () => {
    assert.deepEqual(parseCompareParam(` ${ACCOUNT_A} , ${CONTRACT_A} `), [ACCOUNT_A, CONTRACT_A]);
  });
});

describe("resolveComparisonEntity", () => {
  const index: EntityLookup[] = [
    { id: ACCOUNT_A, label: "Kraken", type: "account", category: "exchange", opCount: 3800 },
  ];

  it("resolves a known address, case-insensitively", () => {
    const result = resolveComparisonEntity(index, ACCOUNT_A.toLowerCase());
    assert.equal(result.found, true);
    assert.equal(result.label, "Kraken");
    assert.equal(result.category, "exchange");
    assert.equal(result.opCount, 3800);
  });

  it("reports an unresolved entity for an address not in the loaded index, without throwing", () => {
    const result = resolveComparisonEntity(index, ACCOUNT_B);
    assert.equal(result.found, false);
    assert.equal(result.label, ACCOUNT_B);
    assert.equal(result.category, null);
    assert.equal(result.opCount, null);
  });
});

describe("computeCounterpartyOverlap", () => {
  it("covers a fully overlapping pair", () => {
    const a = [counterparty("X"), counterparty("Y")];
    const b = [counterparty("X"), counterparty("Y")];
    const result = computeCounterpartyOverlap(a, b);
    assert.deepEqual(result, { overlapping: ["X", "Y"], onlyA: [], onlyB: [] });
  });

  it("covers a fully disjoint pair", () => {
    const a = [counterparty("X")];
    const b = [counterparty("Y")];
    const result = computeCounterpartyOverlap(a, b);
    assert.deepEqual(result, { overlapping: [], onlyA: ["X"], onlyB: ["Y"] });
  });

  it("covers a partially overlapping pair", () => {
    const a = [counterparty("X"), counterparty("Shared")];
    const b = [counterparty("Y"), counterparty("Shared")];
    const result = computeCounterpartyOverlap(a, b);
    assert.deepEqual(result, { overlapping: ["Shared"], onlyA: ["X"], onlyB: ["Y"] });
  });

  it("returns empty overlap for two empty lists (today's no-live-edge-data state)", () => {
    assert.deepEqual(computeCounterpartyOverlap([], []), { overlapping: [], onlyA: [], onlyB: [] });
  });
});

describe("summarizeCategoryMix", () => {
  it("returns an empty distribution for no counterparties", () => {
    assert.deepEqual(summarizeCategoryMix([]), []);
  });

  it("buckets uncategorized counterparties explicitly rather than dropping them", () => {
    const result = summarizeCategoryMix([counterparty("X")]);
    assert.deepEqual(result, [{ category: "uncategorized", count: 1, percent: 100 }]);
  });

  it("computes percentages and sorts by count descending", () => {
    const result = summarizeCategoryMix([
      counterparty("A", "exchange"),
      counterparty("B", "exchange"),
      counterparty("C", "amm"),
    ]);
    assert.deepEqual(result, [
      { category: "exchange", count: 2, percent: (2 / 3) * 100 },
      { category: "amm", count: 1, percent: (1 / 3) * 100 },
    ]);
  });
});
