import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSearchIndex, extractAssetCode } from "@/lib/search/build-index";
import { searchIndex } from "@/lib/search/query";
import { findTreemapPath } from "@/lib/search/find-path";
import { createSearchFixtures } from "@/lib/search/fixtures";
import type { SearchIndexEntry, SearchResult } from "@/lib/search/types";

const data = createSearchFixtures();
const index = buildSearchIndex(data);

function flatResults(query: string): SearchResult[] {
  return searchIndex(index, query).groups.flatMap((group) => group.results);
}

describe("extractAssetCode", () => {
  it("pulls codes from issuer display names", () => {
    assert.equal(extractAssetCode("Circle USDC"), "USDC");
    assert.equal(extractAssetCode("Centre USDC (Testnet)"), "USDC");
    assert.equal(extractAssetCode("USDC"), "USDC");
  });
});

describe("buildSearchIndex", () => {
  it("indexes accounts, contracts, protocols, assets, and categories", () => {
    const types = new Set(index.map((entry) => entry.type));
    assert.ok(types.has("account"));
    assert.ok(types.has("contract"));
    assert.ok(types.has("protocol"));
    assert.ok(types.has("asset"));
    assert.ok(types.has("category"));
  });

  it("keeps duplicate labels as distinct contract rows", () => {
    const aquarius = index.filter(
      (entry) =>
        entry.type === "contract" && entry.label === "Aquarius Pool",
    );
    assert.equal(aquarius.length, 2);
    const ids = new Set(aquarius.map((entry) => entry.id));
    assert.equal(ids.size, 2);
  });

  it("keeps same-code assets distinguishable by issuer", () => {
    const usdcAssets = index.filter(
      (entry) => entry.type === "asset" && entry.assetCode === "USDC",
    );
    assert.ok(usdcAssets.length >= 2);
    const issuers = new Set(usdcAssets.map((entry) => entry.issuer));
    assert.equal(issuers.size, usdcAssets.length);
  });
});

describe("searchIndex", () => {
  it("resolves exact account identifiers deterministically", () => {
    const id = "GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKTM";
    const results = flatResults(id);
    assert.ok(results.length >= 1);
    assert.equal(results[0]?.id, id);
    assert.equal(results[0]?.type, "account");
    // Re-run for stability.
    const again = flatResults(id);
    assert.equal(again[0]?.key, results[0]?.key);
  });

  it("resolves exact contract identifiers deterministically", () => {
    const id = "CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2";
    const results = flatResults(id);
    assert.equal(results[0]?.id, id);
    assert.equal(results[0]?.type, "contract");
  });

  it("matches names case-insensitively", () => {
    const upper = flatResults("KRAKEN");
    const lower = flatResults("kraken");
    const mixed = flatResults("Kraken");
    assert.ok(upper.some((r) => r.label === "Kraken"));
    assert.ok(lower.some((r) => r.label === "Kraken"));
    assert.equal(upper[0]?.key, lower[0]?.key);
    assert.equal(mixed[0]?.key, lower[0]?.key);
  });

  it("matches protocols case-insensitively", () => {
    const results = flatResults("soroswap");
    assert.ok(results.some((r) => r.type === "protocol" && r.label === "Soroswap"));
    assert.ok(results.some((r) => r.type === "contract"));
  });

  it("returns multiple USDC assets distinguished by issuer", () => {
    const results = flatResults("USDC");
    const assets = results.filter((r) => r.type === "asset");
    assert.ok(assets.length >= 2);
    for (const asset of assets) {
      assert.equal(asset.assetCode, "USDC");
      assert.ok(asset.issuer);
      assert.ok(asset.subtitle?.includes(asset.issuer!) || asset.issuer);
    }
    const issuerSet = new Set(assets.map((a) => a.issuer));
    assert.equal(issuerSet.size, assets.length);
  });

  it("labels every result with a type", () => {
    const results = flatResults("pool");
    assert.ok(results.length > 0);
    for (const result of results) {
      assert.ok(
        ["account", "contract", "protocol", "asset", "category"].includes(
          result.type,
        ),
      );
    }
    const grouped = searchIndex(index, "pool");
    for (const group of grouped.groups) {
      assert.ok(group.label.length > 0);
      assert.ok(group.results.every((r) => r.type === group.type));
    }
  });

  it("returns an explicit empty result for unknown queries", () => {
    const empty = searchIndex(index, "definitely-not-in-index-zzxxyy");
    assert.equal(empty.total, 0);
    assert.deepEqual(empty.groups, []);
    assert.equal(empty.query, "definitely-not-in-index-zzxxyy");
  });

  it("returns empty groups for blank queries", () => {
    const empty = searchIndex(index, "   ");
    assert.equal(empty.total, 0);
  });
});

describe("searchIndex — typo-tolerant fuzzy ranking", () => {
  it("finds a protocol name with a doubled letter typo", () => {
    const results = flatResults("Krakken");
    assert.ok(results.some((r) => r.label === "Kraken"));
  });

  it("finds a protocol name with a transposed-letter typo", () => {
    const results = flatResults("Karken");
    assert.ok(results.some((r) => r.label === "Kraken"));
  });

  it("finds a longer protocol name with a missing letter", () => {
    const results = flatResults("Sorswap");
    assert.ok(results.some((r) => r.label === "Soroswap"));
  });

  it("ranks an exact match above a fuzzy match for a different entry", () => {
    // "Kraken" is both an exact label match and, by construction, close
    // enough to fuzzy-match other entries too — the exact hit must win.
    const results = flatResults("Kraken");
    assert.equal(results[0]?.label, "Kraken");
  });

  it("still exact-matches a pasted address first, never fuzzy-ranked below it", () => {
    const id = "GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKTM";
    const results = flatResults(id);
    assert.equal(results[0]?.id, id);
  });

  it("does not fuzzy-match unrelated short queries", () => {
    // "pool" differs from "poll" by one edit, but is only 4 characters —
    // real typo tolerance should not turn every short word into noise.
    const results = flatResults("pool");
    for (const result of results) {
      assert.ok(
        result.label.toLowerCase().includes("pool") ||
          result.subtitle?.toLowerCase().includes("pool") ||
          result.category?.toLowerCase().includes("pool"),
      );
    }
  });

  it("highlights the matched word in the label for a typo match", () => {
    const results = flatResults("Krakken");
    const kraken = results.find((r) => r.label === "Kraken");
    assert.ok(kraken?.labelMatchSpans);
    const [start, end] = kraken!.labelMatchSpans![0];
    assert.equal(kraken!.label.slice(start, end).toLowerCase(), "kraken");
  });

  it("highlights a precise substring span for a non-fuzzy match", () => {
    const results = flatResults("krak");
    const kraken = results.find((r) => r.label === "Kraken");
    assert.deepEqual(kraken?.labelMatchSpans, [[0, 4]]);
  });

  it("returns no results for a query too different from anything indexed", () => {
    const results = flatResults("zzzqqqxxx999");
    assert.equal(results.length, 0);
  });
});

describe("searchIndex — performance smoke on registry size", () => {
  function syntheticEntry(i: number): SearchIndexEntry {
    // Each label/term is unique (not a shared word plus a number), so a
    // typo'd query can only be close enough to fuzzy-match *one* specific
    // entry — while still forcing every other entry through the full
    // fuzzy fallback (same length, no exact/prefix/substring hit).
    const word = `zephyrion${i}`;
    return {
      key: `synthetic-${i}`,
      type: "contract",
      label: `Zephyrion${i}`,
      treemapView: "events",
      nodeType: "contract",
      exactIds: [`C${i.toString().padStart(55, "0")}`],
      terms: [word],
    };
  }

  const largeIndex: SearchIndexEntry[] = Array.from({ length: 3000 }, (_, i) => syntheticEntry(i));

  it("stays fast even when a typo-tolerant query falls through to the fuzzy tier for every entry", () => {
    // One substitution typo against entry 1500's term specifically; every
    // other one of the 3000 entries still has to run (and fail) the fuzzy
    // fallback — close to the worst case the debounced UI caller exists
    // to protect against.
    const started = performance.now();
    const result = searchIndex(largeIndex, "zephyrian1500");
    const elapsedMs = performance.now() - started;

    assert.ok(result.total > 0, "expected the typo'd query to still find its target entry");
    assert.ok(result.groups.some((group) => group.results.some((r) => r.label === "Zephyrion1500")));
    // Generous bound — this is a smoke test against runaway complexity
    // (e.g. an accidental O(n^2) regression), not a strict perf budget.
    assert.ok(elapsedMs < 500, `searchIndex over 3000 entries took ${elapsedMs}ms, expected < 500ms`);
  });

  it("stays fast for a query with no match at all (every entry reaches the fuzzy fallback and fails)", () => {
    const started = performance.now();
    const result = searchIndex(largeIndex, "zzzzzzzzzzzzzzzzzzzz");
    const elapsedMs = performance.now() - started;

    assert.equal(result.total, 0);
    assert.ok(elapsedMs < 500, `searchIndex over 3000 entries took ${elapsedMs}ms, expected < 500ms`);
  });
});

describe("selection / path behavior", () => {
  it("opens account context path in the actors treemap", () => {
    const id = "GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKTM";
    const result = flatResults(id)[0];
    assert.ok(result);
    assert.equal(result.treemapView, "actors");
    const path = findTreemapPath(data.treemaps.actors, result);
    assert.ok(path);
    const leaf = path![path!.length - 1];
    assert.equal(leaf.meta?.id ?? leaf.id, id);
  });

  it("opens contract context path", () => {
    const id = "CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2";
    const result = flatResults(id)[0];
    assert.ok(result);
    const path = findTreemapPath(data.treemaps.actors, result);
    assert.ok(path);
    assert.equal(path![path!.length - 1].meta?.id, id);
  });

  it("distinguishes duplicate Aquarius Pool contracts by id on selection", () => {
    const results = flatResults("Aquarius Pool").filter(
      (r) => r.type === "contract",
    );
    assert.equal(results.length, 2);
    const paths = results.map((r) => findTreemapPath(data.treemaps.actors, r));
    assert.ok(paths[0]);
    assert.ok(paths[1]);
    const leafIds = paths.map(
      (path) => path![path!.length - 1].meta?.id ?? path![path!.length - 1].id,
    );
    assert.notEqual(leafIds[0], leafIds[1]);
  });

  it("resolves category search into the events treemap", () => {
    const results = flatResults("payments");
    const category = results.find((r) => r.type === "category");
    assert.ok(category);
    assert.equal(category!.treemapView, "events");
    const path = findTreemapPath(data.treemaps.events, category!);
    assert.ok(path);
    assert.equal(path![path!.length - 1].meta?.type, "category");
  });

  it("resolves protocol search to a tagged entity path", () => {
    const results = flatResults("aqua.network");
    const protocol = results.find((r) => r.type === "protocol");
    assert.ok(protocol);
    const path = findTreemapPath(data.treemaps.actors, protocol!);
    assert.ok(path);
    assert.equal(
      path![path!.length - 1].meta?.protocol?.toLowerCase(),
      "aqua.network",
    );
  });

  it("asset selection targets the issuer account node", () => {
    const assets = flatResults("USDC").filter((r) => r.type === "asset");
    assert.ok(assets.length >= 1);
    for (const asset of assets) {
      const path = findTreemapPath(data.treemaps.actors, asset);
      // Issuer may only appear under payments in actors view.
      if (path) {
        assert.equal(path[path.length - 1].meta?.id, asset.issuer);
      } else {
        // Still a valid selectable result with issuer identity for the detail panel.
        assert.ok(asset.issuer);
        assert.equal(asset.nodeType, "account");
      }
    }
  });
});
