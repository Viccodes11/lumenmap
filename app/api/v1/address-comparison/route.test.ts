import assert from "node:assert/strict";
import { test } from "node:test";
import { FIXTURE_ACCOUNTS } from "@/lib/fixtures/raw-data";
import { handleAddressComparisonRequest } from "./route";

test("comparison route rejects invalid addresses before loading data", async () => {
  let called = false;
  const request = new Request(`http://localhost/api/v1/address-comparison?a=bad&b=${FIXTURE_ACCOUNTS.kraken}`);
  const result = await handleAddressComparisonRequest(request, async () => {
    called = true;
    throw new Error("unexpected");
  });
  assert.equal(result.status, 400);
  assert.equal(called, false);
  assert.match((await result.json()).message, /valid Stellar/);
});

test("comparison route returns two profiles for the active period", async () => {
  const previous = process.env.LUMENMAP_DATA_SOURCE;
  process.env.LUMENMAP_DATA_SOURCE = "fixture";
  try {
    const request = new Request(`http://localhost/api/v1/address-comparison?period=7d&a=${FIXTURE_ACCOUNTS.kraken}&b=${FIXTURE_ACCOUNTS.unknownA}`);
    const result = await handleAddressComparisonRequest(request);
    assert.equal(result.status, 200);
    const body = await result.json();
    assert.equal(body.period, "7d");
    assert.equal(body.a.address, FIXTURE_ACCOUNTS.kraken);
    assert.equal(body.b.address, FIXTURE_ACCOUNTS.unknownA);
    assert.ok(body.a.opCount > 0);
  } finally {
    if (previous === undefined) delete process.env.LUMENMAP_DATA_SOURCE;
    else process.env.LUMENMAP_DATA_SOURCE = previous;
  }
});
