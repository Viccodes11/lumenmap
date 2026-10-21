import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { FIXTURE_ACCOUNTS, FIXTURE_CONTRACTS } from "@/lib/fixtures/raw-data";
import { inputsFromActivity } from "@/lib/protocol-health/assemble";
import {
  PROTOCOL_HEALTH_WEIGHT_BPS,
  PROTOCOL_HEALTH_WEIGHTS,
} from "@/lib/protocol-health/constants";
import { getFixtureProtocolHealth } from "@/lib/protocol-health/fixture";
import { scoreProtocolCohort } from "@/lib/protocol-health/score";
import type { TvlAdapterResult } from "@/lib/tvl/adapter";

describe("protocol health weights", () => {
  test("basis points match the documented decimals and sum to 100", () => {
    const bps = Object.values(PROTOCOL_HEALTH_WEIGHT_BPS);
    assert.equal(bps.reduce((sum, value) => sum + value, 0), 100);
    assert.equal(PROTOCOL_HEALTH_WEIGHT_BPS.ops / 100, PROTOCOL_HEALTH_WEIGHTS.ops);
    assert.equal(
      PROTOCOL_HEALTH_WEIGHT_BPS.wallets / 100,
      PROTOCOL_HEALTH_WEIGHTS.wallets,
    );
    assert.equal(
      PROTOCOL_HEALTH_WEIGHT_BPS.volume / 100,
      PROTOCOL_HEALTH_WEIGHTS.volume,
    );
    assert.equal(PROTOCOL_HEALTH_WEIGHT_BPS.tvl / 100, PROTOCOL_HEALTH_WEIGHTS.tvl);
  });
});

describe("scoreProtocolCohort", () => {
  test("drops a missing component instead of treating it as zero", () => {
    const [onlyOps] = scoreProtocolCohort([
      {
        protocol: "Solo",
        ops: 10,
        wallets: null,
        volumeXlm: null,
        tvlUsd: null,
      },
    ]);

    assert.equal(onlyOps.components.ops.status, "available");
    assert.equal(onlyOps.components.ops.score, 100);
    assert.equal(onlyOps.components.tvl.status, "unavailable");
    assert.equal(onlyOps.components.tvl.value, null);
    assert.equal(onlyOps.components.tvl.score, null);
    assert.equal(onlyOps.score, 100);
  });

  test("returns null when every component is unavailable", () => {
    const [empty] = scoreProtocolCohort([
      {
        protocol: "Empty",
        ops: null,
        wallets: null,
        volumeXlm: null,
        tvlUsd: null,
      },
    ]);
    assert.equal(empty.score, null);
    assert.equal(empty.components.tvl.status, "unavailable");
  });

  test("does not let a missing TVL become the cohort minimum", () => {
    const scored = scoreProtocolCohort([
      {
        protocol: "High",
        ops: 100,
        wallets: 2,
        volumeXlm: 50,
        tvlUsd: 20,
      },
      {
        protocol: "Low",
        ops: 40,
        wallets: 2,
        volumeXlm: 10,
        tvlUsd: 10,
      },
      {
        protocol: "NoTvl",
        ops: 40,
        wallets: 2,
        volumeXlm: 10,
        tvlUsd: null,
      },
    ]);

    const low = scored.find((row) => row.protocol === "Low");
    const missing = scored.find((row) => row.protocol === "NoTvl");
    assert.ok(low);
    assert.ok(missing);
    assert.equal(low.components.tvl.score, 0);
    assert.equal(missing.components.tvl.status, "unavailable");
    assert.ok((missing.score ?? 0) > 0);
    const opsWeight = PROTOCOL_HEALTH_WEIGHT_BPS.ops;
    const walletsWeight = PROTOCOL_HEALTH_WEIGHT_BPS.wallets;
    const volumeWeight = PROTOCOL_HEALTH_WEIGHT_BPS.volume;
    const tvlWeight = PROTOCOL_HEALTH_WEIGHT_BPS.tvl;
    const lowComposite =
      ((low.components.ops.score ?? 0) * opsWeight +
        (low.components.wallets.score ?? 0) * walletsWeight +
        (low.components.volume.score ?? 0) * volumeWeight +
        (low.components.tvl.score ?? 0) * tvlWeight) /
      (opsWeight + walletsWeight + volumeWeight + tvlWeight);
    const missingComposite =
      ((missing.components.ops.score ?? 0) * opsWeight +
        (missing.components.wallets.score ?? 0) * walletsWeight +
        (missing.components.volume.score ?? 0) * volumeWeight) /
      (opsWeight + walletsWeight + volumeWeight);
    assert.ok(missingComposite > lowComposite);
  });

  test("keeps a measured zero TVL in the cohort", () => {
    const scored = scoreProtocolCohort([
      {
        protocol: "Locked",
        ops: 5,
        wallets: 1,
        volumeXlm: 1,
        tvlUsd: 0,
      },
      {
        protocol: "Richer",
        ops: 5,
        wallets: 1,
        volumeXlm: 1,
        tvlUsd: 25,
      },
    ]);
    const locked = scored.find((row) => row.protocol === "Locked");
    assert.equal(locked?.components.tvl.status, "available");
    assert.equal(locked?.components.tvl.value, 0);
    assert.equal(locked?.components.tvl.score, 0);
  });
});

describe("protocol health fixture", () => {
  test("covers at least three protocols and leaves MintX TVL unavailable", () => {
    const body = getFixtureProtocolHealth("1d");
    assert.ok(body.protocols.length >= 3);
    assert.equal(body.fixture, true);
    assert.equal(body.source, "fixture");

    const mintx = body.protocols.find((row) => row.protocol === "MintX");
    assert.ok(mintx);
    assert.equal(mintx.components.tvl.status, "unavailable");
    assert.equal(mintx.components.tvl.value, null);
    assert.ok((mintx.score ?? 0) > 0);
    assert.equal(mintx.detail.context, "entity");
    assert.match(mintx.detail.href, /q=MintX/);

    const soroswap = body.protocols.find((row) => row.protocol === "Soroswap");
    assert.ok(soroswap);
    assert.equal(soroswap.components.tvl.status, "available");
    assert.equal(soroswap.components.tvl.score, 0);
    assert.equal(soroswap.detail.context, "protocol");
    assert.equal(soroswap.detail.href, "/?metric=protocol_tvl&path=soroswap");
    assert.ok((soroswap.timeseries?.length ?? 0) >= 2);

    const lobstr = body.protocols.find((row) => row.protocol === "LOBSTR");
    assert.equal(lobstr?.timeseries, undefined);
  });

  test("scales flow inputs with the period and leaves the snapshot TVL fixed", () => {
    const day = getFixtureProtocolHealth("1d");
    const week = getFixtureProtocolHealth("7d");
    const dayOps = day.protocols.find((row) => row.protocol === "Soroswap");
    const weekOps = week.protocols.find((row) => row.protocol === "Soroswap");
    assert.equal(weekOps?.components.ops.value, (dayOps?.components.ops.value ?? 0) * 6);
    assert.equal(weekOps?.components.tvl.value, dayOps?.components.tvl.value);
    assert.equal(week.period, "7d");
  });
});

describe("inputsFromActivity", () => {
  test("marks missing volume and failed TVL unavailable without Hubble", () => {
    const failed: TvlAdapterResult = {
      protocol: "Kraken",
      network: "stellar",
      status: "failed",
      snapshotTime: "2026-01-01T00:00:00.000Z",
      error: "adapter down",
    };
    const complete: TvlAdapterResult = {
      protocol: "Soroswap",
      network: "stellar",
      status: "complete",
      methodologyVersion: "1.0.0",
      snapshotTime: "2026-01-01T00:00:00.000Z",
      positions: [
        {
          canonicalAsset: "USD",
          nativeAmount: "10",
          usdValue: "10",
          priceProvenance: {
            source: "test",
            timestamp: "2026-01-01T00:00:00.000Z",
          },
        },
      ],
    };

    const inputs = inputsFromActivity(
      [
        {
          account_id: FIXTURE_ACCOUNTS.kraken,
          type_string: "payment",
          op_count: 10,
          xlm_volume: 5,
        },
        {
          account_id: FIXTURE_ACCOUNTS.moneygram,
          type_string: "payment",
          op_count: 4,
        },
      ],
      [{ contract_id: FIXTURE_CONTRACTS.soroswap, op_count: 20 }],
      [failed, complete],
    );

    const kraken = inputs.find((row) => row.protocol === "Kraken");
    const moneygram = inputs.find((row) => row.protocol === "MoneyGram");
    const soroswap = inputs.find((row) => row.protocol === "Soroswap");
    assert.equal(kraken?.volumeXlm, 5);
    assert.equal(kraken?.tvlUsd, null);
    assert.equal(moneygram?.volumeXlm, null);
    assert.equal(moneygram?.tvlUsd, null);
    assert.equal(soroswap?.tvlUsd, 10);
    assert.equal(soroswap?.volumeXlm, null);

    const scored = scoreProtocolCohort(inputs);
    const krakenScore = scored.find((row) => row.protocol === "Kraken");
    assert.equal(krakenScore?.components.tvl.status, "unavailable");
    assert.ok((krakenScore?.score ?? 0) > 0);
  });
});
