import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { BigQueryLimitExceededError } from "@/lib/hubble/errors";
import { getFixtureProtocolHealth } from "@/lib/protocol-health/fixture";
import type { ProtocolHealthResponseBody } from "@/lib/schemas/protocol-health";
import {
  handleProtocolHealthRequest,
  parseProtocolHealthPeriod,
} from "./_handler";

const periods = ["1d", "7d", "30d", "month"] as const;

function request(path: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: { "x-forwarded-for": "203.0.113.79" },
  });
}

describe("parseProtocolHealthPeriod", () => {
  test("defaults to 1d and rejects unknown periods", () => {
    assert.deepEqual(parseProtocolHealthPeriod(null), { ok: true, period: "1d" });
    assert.equal(parseProtocolHealthPeriod("1y").ok, false);
  });
});

describe("GET /api/v1/protocols/health", () => {
  test("validates fixture mode for every period without calling the live loader", async () => {
    const original = process.env.LUMENMAP_DATA_SOURCE;
    process.env.LUMENMAP_DATA_SOURCE = "fixture";

    try {
      for (const period of periods) {
        const response = await handleProtocolHealthRequest(
          request(`/api/v1/protocols/health?period=${period}`),
        );
        assert.equal(response.status, 200);
        const body = (await response.json()) as ProtocolHealthResponseBody;
        assert.equal(body.period, period);
        assert.equal(body.source, "fixture");
        assert.equal(body.fixture, true);
        assert.ok(body.protocols.length >= 3);
        assert.equal(body.methodology.weights.ops, 0.35);
        assert.equal(body.methodology.weights.wallets, 0.25);
        assert.equal(body.methodology.weights.volume, 0.25);
        assert.equal(body.methodology.weights.tvl, 0.15);
        assert.equal(body.methodology.missingInput, "drop-and-renormalize");
        const mintx = body.protocols.find((row) => row.protocol === "MintX");
        assert.equal(mintx?.components.tvl.status, "unavailable");
        assert.ok((mintx?.score ?? 0) > 0);
      }
    } finally {
      if (original === undefined) delete process.env.LUMENMAP_DATA_SOURCE;
      else process.env.LUMENMAP_DATA_SOURCE = original;
    }
  });

  test("defaults the period when the query is omitted", async () => {
    const original = process.env.LUMENMAP_DATA_SOURCE;
    process.env.LUMENMAP_DATA_SOURCE = "fixture";
    try {
      const response = await handleProtocolHealthRequest(
        request("/api/v1/protocols/health"),
      );
      assert.equal(response.status, 200);
      const body = (await response.json()) as ProtocolHealthResponseBody;
      assert.equal(body.period, "1d");
      assert.equal(
        response.headers.get("Cache-Control"),
        "public, max-age=900, s-maxage=900",
      );
    } finally {
      if (original === undefined) delete process.env.LUMENMAP_DATA_SOURCE;
      else process.env.LUMENMAP_DATA_SOURCE = original;
    }
  });

  test("returns 400 for an invalid period or network", async () => {
    let calls = 0;
    const periodResponse = await handleProtocolHealthRequest(
      request("/api/v1/protocols/health?period=1y"),
      async () => {
        calls += 1;
        return getFixtureProtocolHealth("1d");
      },
    );
    assert.equal(periodResponse.status, 400);
    assert.equal((await periodResponse.json()).code, "INVALID_PERIOD");

    const networkResponse = await handleProtocolHealthRequest(
      request("/api/v1/protocols/health?network=kovan"),
      async () => {
        calls += 1;
        return getFixtureProtocolHealth("1d");
      },
    );
    assert.equal(networkResponse.status, 400);
    assert.equal((await networkResponse.json()).code, "INVALID_NETWORK");
    assert.equal(calls, 0);
  });

  test("returns a safe provider error and a limit error", async () => {
    const unexpected = await handleProtocolHealthRequest(
      request("/api/v1/protocols/health?period=30d"),
      async () => {
        throw new Error("BigQuery secret token leaked");
      },
    );
    assert.equal(unexpected.status, 500);
    assert.deepEqual(await unexpected.json(), {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred. Please try again later.",
    });

    const limited = await handleProtocolHealthRequest(
      request("/api/v1/protocols/health?period=7d"),
      async () => {
        throw new BigQueryLimitExceededError("Query scan bytes limit exceeded", 10, "SELECT 1", {});
      },
    );
    assert.equal(limited.status, 400);
    assert.equal((await limited.json()).code, "LIMIT_EXCEEDED");
  });

  test("rejects a payload that fails Zod validation", async () => {
    const response = await handleProtocolHealthRequest(
      request("/api/v1/protocols/health?period=1d"),
      async () => {
        const body = getFixtureProtocolHealth("1d");
        body.protocols[0].components.tvl.status = "unavailable";
        body.protocols[0].components.tvl.value = 10;
        return body;
      },
    );
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      code: "INTERNAL_ERROR",
      message: "Protocol health response failed validation",
    });
  });
});
