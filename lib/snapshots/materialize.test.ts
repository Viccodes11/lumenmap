import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { hashKpiPayload } from "./hash";
import { materializeSnapshot } from "./materialize";
import type { ResearchSnapshot } from "./types";
import type { ActivityKpis } from "@/lib/types";

const kpis: ActivityKpis = {
  totalOps: { kind: "operations", unit: "ops", value: 1200 },
  sorobanShare: { kind: "share", unit: "percent", value: 42 },
  topCategory: "Payments",
  activeContracts: { kind: "entity_count", unit: "count", value: 8 },
  activeWallets: { kind: "entity_count", unit: "count", value: 40 },
  activeDestinationAccounts: { kind: "entity_count", unit: "count", value: 15 },
};

describe("materializeSnapshot", () => {
  test("restores KPIs and treemap selection from the frozen payload", () => {
    const snapshot: ResearchSnapshot = {
      id: "abcdefgh",
      generatedAt: "2026-10-21T12:00:00.000Z",
      expiresAt: "2026-10-28T12:00:00.000Z",
      period: "7d",
      metric: "ops",
      view: "events",
      selectedNodes: [
        { id: "payments", name: "Payments", value: 700, share: 58, path: ["Network"] },
      ],
      kpiPayloadHash: hashKpiPayload(kpis),
      kpis,
      source: "fixture",
    };

    const frozen = materializeSnapshot(snapshot);
    assert.equal(frozen.data.kpis.totalOps.value, 1200);
    assert.equal(frozen.data.period, "7d");
    assert.equal(frozen.data.source, "fixture");
    assert.equal(frozen.selected?.name, "Payments");
    assert.equal(frozen.path.at(-1)?.name, "Network");
    const events = frozen.data.treemaps.events;
    assert.equal(events.children?.[0]?.name, "Network");
    assert.equal(events.children?.[0]?.children?.[0]?.name, "Payments");
  });
});
