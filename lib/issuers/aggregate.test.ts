import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateIssuers, truncateIssuer } from "@/lib/issuers/aggregate";
import { ISSUER_FIXTURE_EVENTS, UNKNOWN_ISSUER } from "@/lib/fixtures/issuers";

const NAMES = {
  GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN: { name: "Circle USDC" },
};

describe("aggregateIssuers", () => {
  it("rolls payment volume and trustline ops into at least five issuers", () => {
    const rows = aggregateIssuers(ISSUER_FIXTURE_EVENTS, NAMES, "volume");
    assert.ok(rows.length >= 5);
    assert.equal(rows[0]?.name, "Circle USDC");
    assert.equal(rows[0]?.paymentVolume, 1_200_000);
  });

  it("sorts by trustline operations when requested", () => {
    const rows = aggregateIssuers(ISSUER_FIXTURE_EVENTS, NAMES, "ops");
    assert.equal(rows[0]?.trustlineOps, 400);
    const unknown = rows.find((row) => row.issuer === UNKNOWN_ISSUER);
    assert.equal(unknown?.trustlineOps, 15);
    assert.deepEqual(unknown?.assets, ["TEST", "TEST2"]);
  });

  it("truncates unknown issuers and keeps the full address for copy", () => {
    const rows = aggregateIssuers(ISSUER_FIXTURE_EVENTS, NAMES);
    const unknown = rows.find((row) => row.issuer === UNKNOWN_ISSUER);
    assert.equal(unknown?.name, null);
    assert.equal(unknown?.displayAddress, truncateIssuer(UNKNOWN_ISSUER));
    assert.equal(unknown?.copyAddress, UNKNOWN_ISSUER);
    const share = rows.reduce((sum, row) => sum + row.opShare, 0);
    assert.ok(Math.abs(share - 1) < 1e-9);
  });
});
