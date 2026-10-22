import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIXTURE_ACCOUNTS, FIXTURE_CONTRACTS } from "@/lib/fixtures/raw-data";
import { addressCategoriesQuery, getAddressProfile } from "./address-comparison-data";
import { compareCounterparties, parseAddressComparisonParam, validateAddressComparison } from "./address-comparison";

describe("address comparison", () => {
  it("validates both addresses and rejects duplicate or extra values", () => {
    assert.equal(validateAddressComparison("bad", FIXTURE_ACCOUNTS.kraken).ok, false);
    assert.equal(validateAddressComparison(FIXTURE_ACCOUNTS.kraken, FIXTURE_ACCOUNTS.kraken).ok, false);
    assert.equal(parseAddressComparisonParam(`${FIXTURE_ACCOUNTS.kraken},${FIXTURE_ACCOUNTS.lobstr},extra`).ok, false);
    const pair = parseAddressComparisonParam(`${FIXTURE_ACCOUNTS.kraken},${FIXTURE_ACCOUNTS.lobstr}`);
    assert.equal(pair.ok, true);
  });

  it("uses a bound address and the correct account or contract field in live queries", () => {
    const account = addressCategoriesQuery("crypto-stellar.crypto_stellar_dbt", "account");
    const contract = addressCategoriesQuery("crypto-stellar.crypto_stellar_dbt", "contract");
    assert.match(account, /op_source_account = @address/);
    assert.match(contract, /contract_id = @address/);
    assert.throws(() => addressCategoriesQuery("invalid.dataset;DROP", "account"));
  });

  it("finds overlapping counterparties in fixture profiles", async () => {
    const previous = process.env.LUMENMAP_DATA_SOURCE;
    process.env.LUMENMAP_DATA_SOURCE = "fixture";
    try {
      const a = await getAddressProfile(FIXTURE_ACCOUNTS.kraken, "1d", "mainnet");
      const b = await getAddressProfile(FIXTURE_ACCOUNTS.unknownA, "1d", "mainnet");
      const overlap = compareCounterparties(a, b);
      assert.deepEqual(overlap.shared.map((row) => row.address), [FIXTURE_ACCOUNTS.lobstr]);
      assert.equal(a.opCount > 0, true);
      assert.equal(a.categories.length > 0, true);
    } finally {
      if (previous === undefined) delete process.env.LUMENMAP_DATA_SOURCE;
      else process.env.LUMENMAP_DATA_SOURCE = previous;
    }
  });

  it("reports disjoint fixture counterparties without false overlap", async () => {
    const previous = process.env.LUMENMAP_DATA_SOURCE;
    process.env.LUMENMAP_DATA_SOURCE = "fixture";
    try {
      const a = await getAddressProfile(FIXTURE_ACCOUNTS.kraken, "1d", "mainnet");
      const b = await getAddressProfile(FIXTURE_ACCOUNTS.lobstr, "1d", "mainnet");
      assert.equal(compareCounterparties(a, b).shared.length, 0);
      assert.equal(b.counterparties.length > 0, true);
    } finally {
      if (previous === undefined) delete process.env.LUMENMAP_DATA_SOURCE;
      else process.env.LUMENMAP_DATA_SOURCE = previous;
    }
  });

  it("supports a contract profile without Flow edges", async () => {
    const previous = process.env.LUMENMAP_DATA_SOURCE;
    process.env.LUMENMAP_DATA_SOURCE = "fixture";
    try {
      const contract = await getAddressProfile(FIXTURE_CONTRACTS.soroswap, "7d", "mainnet");
      assert.equal(contract.opCount, 900_000);
      assert.deepEqual(contract.categories, [{ name: "invoke_host_function", opCount: 900_000 }]);
      assert.deepEqual(contract.counterparties, []);
    } finally {
      if (previous === undefined) delete process.env.LUMENMAP_DATA_SOURCE;
      else process.env.LUMENMAP_DATA_SOURCE = previous;
    }
  });
});
