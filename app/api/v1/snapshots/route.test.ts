import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { handleCreateSnapshot, handleGetSnapshot } from "./_handler";
import { DEFAULT_SNAPSHOT_MAX_BYTES } from "@/lib/snapshots/constants";
import { hashKpiPayload } from "@/lib/snapshots/hash";
import {
  clearSnapshotStore,
  resetSnapshotClock,
  setSnapshotClock,
} from "@/lib/snapshots/store";
import type { ActivityKpis } from "@/lib/types";

const kpis: ActivityKpis = {
  totalOps: { kind: "operations", unit: "ops", value: 1200 },
  sorobanShare: { kind: "share", unit: "percent", value: 42 },
  topCategory: "Payments",
  activeContracts: { kind: "entity_count", unit: "count", value: 8 },
  activeWallets: { kind: "entity_count", unit: "count", value: 40 },
  activeDestinationAccounts: { kind: "entity_count", unit: "count", value: 15 },
};

function snapshotBody() {
  return {
    period: "7d",
    metric: "ops",
    view: "events",
    selectedNodes: [
      {
        id: "payments",
        name: "Payments",
        value: 700,
        share: 58,
        path: ["Network"],
      },
    ],
    kpis,
    source: "fixture",
    network: "mainnet",
  };
}

afterEach(() => {
  clearSnapshotStore();
  resetSnapshotClock();
});

describe("POST /api/v1/snapshots and GET /api/v1/snapshots/:id", () => {
  test("creates a snapshot and returns the same frozen payload", async () => {
    const created = await handleCreateSnapshot(
      new Request("http://localhost/api/v1/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(snapshotBody()),
      }),
    );

    assert.equal(created.status, 201);
    const payload = (await created.json()) as {
      id: string;
      url: string;
      snapshot: { kpis: ActivityKpis; kpiPayloadHash: string; period: string };
    };
    assert.match(payload.id, /^[A-Za-z0-9_-]{8,32}$/);
    assert.equal(payload.url, `/s/${payload.id}`);
    assert.equal(payload.snapshot.period, "7d");
    assert.deepEqual(payload.snapshot.kpis, kpis);
    assert.equal(payload.snapshot.kpiPayloadHash, hashKpiPayload(kpis));

    const fetched = await handleGetSnapshot(
      new Request(`http://localhost/api/v1/snapshots/${payload.id}`),
      payload.id,
    );
    assert.equal(fetched.status, 200);
    const frozen = (await fetched.json()) as {
      id: string;
      kpis: ActivityKpis;
      kpiPayloadHash: string;
      selectedNodes: Array<{ name: string }>;
    };
    assert.equal(frozen.id, payload.id);
    assert.deepEqual(frozen.kpis, kpis);
    assert.equal(frozen.kpiPayloadHash, payload.snapshot.kpiPayloadHash);
    assert.equal(frozen.selectedNodes[0]?.name, "Payments");
  });

  test("returns 404 for a missing id", async () => {
    const response = await handleGetSnapshot(
      new Request("http://localhost/api/v1/snapshots/missing-id"),
      "missing-id",
    );
    assert.equal(response.status, 404);
    const body = (await response.json()) as { code: string; message: string };
    assert.equal(body.code, "SNAPSHOT_NOT_FOUND");
    assert.match(body.message, /missing or has expired/i);
  });

  test("returns 404 after the snapshot TTL elapses", async () => {
    let now = Date.parse("2026-10-21T12:00:00.000Z");
    setSnapshotClock(() => now);

    const created = await handleCreateSnapshot(
      new Request("http://localhost/api/v1/snapshots", {
        method: "POST",
        body: JSON.stringify(snapshotBody()),
      }),
    );
    const payload = (await created.json()) as { id: string };
    now += 7 * 24 * 60 * 60 * 1000 + 1;

    const response = await handleGetSnapshot(
      new Request(`http://localhost/api/v1/snapshots/${payload.id}`),
      payload.id,
    );
    assert.equal(response.status, 404);
  });

  test("returns 413 for an oversized body", async () => {
    const response = await handleCreateSnapshot(
      new Request("http://localhost/api/v1/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "x".repeat(DEFAULT_SNAPSHOT_MAX_BYTES + 1),
      }),
    );
    assert.equal(response.status, 413);
    const body = (await response.json()) as { code: string; maxBytes: number };
    assert.equal(body.code, "PAYLOAD_TOO_LARGE");
    assert.equal(body.maxBytes, DEFAULT_SNAPSHOT_MAX_BYTES);
  });
});
