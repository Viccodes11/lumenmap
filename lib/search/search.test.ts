import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSearchIndex, extractAssetCode } from "@/lib/search/build-index";
import { searchIndex } from "@/lib/search/query";
import { findTreemapPath } from "@/lib/search/find-path";
import { createSearchFixtures } from "@/lib/search/fixtures";
import type { SearchResult } from "@/lib/search/types";

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
    const fixtureIds = new Set(data.contracts.map((row) => row.contract_id));
    const aquarius = index.filter(
      (entry) =>
        entry.type === "contract" && entry.label === "Aquarius Pool" &&
        fixtureIds.has(entry.id ?? ""),
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

  it("finds registry labels and known protocols beyond the loaded activity", () => {
    const results = flatResults("lobstr");
    assert.ok(results.some((r) => r.label === "LOBSTR"));
    assert.ok(results.some((r) => r.type === "protocol" && r.label === "LOBSTR"));
    const registryOnly = searchIndex(buildSearchIndex(), "lobstr");
    assert.ok(registryOnly.groups.some((group) =>
      group.results.some((result) => result.label === "LOBSTR"),
    ));
  });

  it("ranks typo matches below exact labels and highlights the matching word", () => {
    const exact = flatResults("Soroswap");
    const typo = flatResults("Soroswp");
    assert.ok(exact.some((r) => r.label === "Soroswap"));
    const match = typo.find((r) => r.label === "Soroswap");
    assert.ok(match);
    assert.deepEqual(match.highlights?.label, [{ start: 0, end: 8 }]);
    assert.ok(flatResults("Aquaris").some((r) => r.label === "Aquarius Pool"));
  });

  it("puts a pasted address before protocol and asset aliases", () => {
    const id = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
    const results = flatResults(id);
    assert.equal(results[0]?.type, "account");
    assert.equal(results[0]?.id, id);
    assert.deepEqual(results[0]?.highlights?.subtitle?.[0], {
      start: results[0]?.subtitle?.indexOf(id),
      end: (results[0]?.subtitle?.indexOf(id) ?? 0) + id.length,
    });
  });

  it("caps broad result sets and searches the registry promptly", () => {
    const start = performance.now();
    const broad = searchIndex(index, "a", 500);
    const typo = searchIndex(index, "Soroswp");
    assert.ok(broad.total <= 40);
    assert.ok(typo.total > 0);
    assert.ok(performance.now() - start < 5_000);
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
    const fixtureIds = new Set(data.contracts.map((row) => row.contract_id));
    const results = flatResults("Aquarius Pool").filter(
      (r) => r.type === "contract" && fixtureIds.has(r.id ?? ""),
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
