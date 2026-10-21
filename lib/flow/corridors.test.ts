import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { FIXTURE_ACCOUNTS } from "@/lib/fixtures/raw-data";
import { FIXTURE_FLOW_EDGES } from "./fixtures";
import { buildCorridors, serializeCorridorsToCsv } from "./corridors";
import type { FlowEdge } from "./graph";

const KRAKEN = FIXTURE_ACCOUNTS.kraken; // "Kraken" exchange entity
const LOBSTR = FIXTURE_ACCOUNTS.lobstr; // "LOBSTR" wallet entity
const UNKNOWN_A = FIXTURE_ACCOUNTS.unknownA; // not in the entity registry
const UNKNOWN_B = FIXTURE_ACCOUNTS.unknownB; // not in the entity registry
const MINTX_GOLD = "GBC5ZGK6MQU3XG5Y72SXPA7P5R5NHYT2475SNEJB2U3EQ6J56QLVGOLD"; // "MintX" protocol
const MINTX_SILVER = "GBZVELEQD3WBN3R3VAG64HVBDOZ76ZL6QPLSFGKWPFED33Q3234NSLVR"; // "MintX" protocol, same cluster as MINTX_GOLD

function edge(partial: Partial<FlowEdge> & Pick<FlowEdge, "source" | "destination">): FlowEdge {
  return {
    id: `${partial.source}->${partial.destination}`,
    assetKey: "native:XLM",
    asset: { code: "XLM" },
    amount: "1000000",
    operationCount: 1,
    ...partial,
  };
}

describe("buildCorridors", () => {
  test("renders fixture corridors from FIXTURE_FLOW_EDGES", () => {
    const table = buildCorridors({ edges: FIXTURE_FLOW_EDGES });
    assert.ok(table.rows.length > 0, "fixture edges produce at least one corridor");
    assert.equal(table.assetKey, "native:XLM");
    const krakenRow = table.rows.find((r) => r.source.label === "Kraken" && r.destination.label === "LOBSTR");
    assert.ok(krakenRow, "Kraken -> LOBSTR corridor is present");
    assert.equal(krakenRow?.operationCount, 5);
  });

  test("merges two addresses sharing one entity's protocol into a single corridor endpoint", () => {
    const edges: FlowEdge[] = [
      edge({ source: MINTX_GOLD, destination: KRAKEN, operationCount: 3, amount: "300" }),
      edge({ source: MINTX_SILVER, destination: KRAKEN, operationCount: 7, amount: "700" }),
    ];
    const table = buildCorridors({ edges });
    assert.equal(table.rows.length, 1, "both MintX addresses collapse into one source cluster");
    assert.equal(table.rows[0].source.id, "entity:MintX");
    assert.equal(table.rows[0].source.labeled, true);
    assert.equal(table.rows[0].operationCount, 10);
    assert.equal(table.rows[0].volume, "1000");
  });

  test("unlabeled addresses fall back to a truncated id and never crash or merge together", () => {
    const edges: FlowEdge[] = [
      edge({ source: UNKNOWN_A, destination: KRAKEN, operationCount: 2, amount: "100" }),
      edge({ source: UNKNOWN_B, destination: KRAKEN, operationCount: 4, amount: "200" }),
    ];
    const table = buildCorridors({ edges });
    assert.equal(table.rows.length, 2, "two distinct unlabeled sources stay distinct corridors");
    for (const row of table.rows) {
      assert.equal(row.source.labeled, false);
      assert.match(row.source.label, /\.\.\./, "falls back to a truncated address label");
    }
  });

  test("drops a corridor between two addresses resolving to the same cluster (internal movement)", () => {
    const edges: FlowEdge[] = [edge({ source: MINTX_GOLD, destination: MINTX_SILVER, operationCount: 9 })];
    const table = buildCorridors({ edges });
    assert.equal(table.rows.length, 0);
    assert.equal(table.totalCorridorCount, 0);
    // The dropped edge's operations still count toward totalOperationCount —
    // it's excluded from corridors, not silently erased from the asset total.
    assert.equal(table.totalOperationCount, 9);
  });

  test("filters strictly by assetKey — a non-XLM edge never leaks into the XLM table", () => {
    const edges: FlowEdge[] = [
      edge({ source: KRAKEN, destination: LOBSTR, assetKey: "native:XLM", operationCount: 5 }),
      edge({
        source: KRAKEN,
        destination: LOBSTR,
        assetKey: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        asset: { code: "USDC" },
        operationCount: 50,
      }),
    ];
    const xlmTable = buildCorridors({ edges }, { assetKey: "native:XLM" });
    assert.equal(xlmTable.rows.length, 1);
    assert.equal(xlmTable.rows[0].operationCount, 5);

    const usdcTable = buildCorridors(
      { edges },
      { assetKey: "USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" },
    );
    assert.equal(usdcTable.rows.length, 1);
    assert.equal(usdcTable.rows[0].operationCount, 50);
  });

  test("caps rows at topN, reports capped + coverage counts, and ranks by operationCount desc", () => {
    const edges: FlowEdge[] = Array.from({ length: 5 }, (_, i) =>
      edge({
        source: `GSOURCE${i}AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`.slice(0, 56),
        destination: KRAKEN,
        operationCount: i + 1,
      }),
    );
    const table = buildCorridors({ edges }, { topN: 2 });
    assert.equal(table.rows.length, 2);
    assert.equal(table.capped, true);
    assert.equal(table.totalCorridorCount, 5);
    assert.deepEqual(
      table.rows.map((r) => r.operationCount),
      [5, 4],
      "ranked by operationCount descending",
    );
    assert.equal(table.includedOperationCount, 9);
    assert.equal(table.totalOperationCount, 1 + 2 + 3 + 4 + 5);
  });

  test("share sums to 1 across the full (uncapped) corridor set", () => {
    const edges: FlowEdge[] = [
      edge({ source: UNKNOWN_A, destination: KRAKEN, operationCount: 3 }),
      edge({ source: UNKNOWN_B, destination: KRAKEN, operationCount: 1 }),
    ];
    const table = buildCorridors({ edges }, { topN: 100 });
    const totalShare = table.rows.reduce((sum, r) => sum + r.share, 0);
    assert.ok(Math.abs(totalShare - 1) < 1e-9);
  });

  test("an empty edge list produces an empty, non-throwing table", () => {
    const table = buildCorridors({ edges: [] });
    assert.deepEqual(table.rows, []);
    assert.equal(table.totalOperationCount, 0);
    assert.equal(table.capped, false);
  });

  test("a malformed amount string contributes zero volume instead of throwing", () => {
    const edges: FlowEdge[] = [edge({ source: UNKNOWN_A, destination: KRAKEN, amount: "not-a-number" })];
    const table = buildCorridors({ edges });
    assert.equal(table.rows[0].volume, "0");
  });
});

describe("serializeCorridorsToCsv", () => {
  test("emits a header-only CSV for an empty table", () => {
    const csv = serializeCorridorsToCsv(buildCorridors({ edges: [] }));
    assert.equal(csv, "source,destination,asset,operation_count,volume,share\n");
  });

  test("serializes rows and escapes commas in labels", () => {
    const table = buildCorridors({ edges: FIXTURE_FLOW_EDGES });
    const csv = serializeCorridorsToCsv(table);
    const lines = csv.split("\n");
    assert.equal(lines[0], "source,destination,asset,operation_count,volume,share");
    assert.equal(lines.length, table.rows.length + 1);
    assert.ok(lines.some((l) => l.startsWith("Kraken,LOBSTR,XLM,5,")));
  });
});
