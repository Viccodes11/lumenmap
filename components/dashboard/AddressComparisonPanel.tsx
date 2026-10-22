"use client";

import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { Button } from "@/components/ui/button";
import {
  COMPARE_PARAM,
  buildCompareParam,
  computeCounterpartyOverlap,
  parseCompareParam,
  resolveComparisonEntity,
  summarizeCategoryMix,
  validateComparisonAddresses,
  type CounterpartyOverlap,
  type CategoryMixEntry,
  type ResolvedComparisonEntity,
} from "@/lib/address-comparison";
import { buildEgoGraph } from "@/lib/flow-ego";
import { buildSearchIndex } from "@/lib/search";
import { formatNumber } from "@/lib/utils";

type ComparisonResult = {
  a: ResolvedComparisonEntity;
  b: ResolvedComparisonEntity;
  overlap: CounterpartyOverlap | null;
  categoryMixA: CategoryMixEntry[] | null;
  categoryMixB: CategoryMixEntry[] | null;
};

function updateCompareUrl(addressA: string, addressB: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set(COMPARE_PARAM, buildCompareParam(addressA, addressB));
  window.history.replaceState(window.history.state, "", url.toString());
}

/**
 * Side-by-side comparison of two addresses for the active period: each
 * side's own type/category/op count (resolved from the already-loaded
 * search index, the same path DashboardSearch and DetailPanel use) plus,
 * when Flow is enabled, their counterparty overlap and category mix.
 *
 * Ego-graph edge data has no live source yet (see FlowEgoSection) — the
 * overlap/category-mix rows render honestly as empty until the activity
 * API starts exposing per-account payment edges, rather than fabricating
 * a result. The counterparty-dependent rows are simply omitted entirely
 * when Flow is disabled (the table-only fallback).
 */
export function AddressComparisonPanel() {
  const { data, flowViewEnabled } = useDashboard();
  const [addressA, setAddressA] = useState("");
  const [addressB, setAddressB] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ComparisonResult | null>(null);

  const index = useMemo(() => (data ? buildSearchIndex(data) : []), [data]);

  const runComparison = (a: string, b: string, syncUrl: boolean) => {
    const validation = validateComparisonAddresses(a, b);
    if (!validation.ok) {
      setError(validation.error);
      setResult(null);
      return;
    }

    const entityA = resolveComparisonEntity(index, a);
    const entityB = resolveComparisonEntity(index, b);

    let overlap: CounterpartyOverlap | null = null;
    let categoryMixA: CategoryMixEntry[] | null = null;
    let categoryMixB: CategoryMixEntry[] | null = null;
    if (flowViewEnabled) {
      // No live edge source yet (FlowEgoSection has the same limitation) —
      // this computes correctly over whatever edges exist, which today is
      // none, so the overlap/mix below are honestly empty rather than faked.
      const graphA = buildEgoGraph(entityA.address, entityA.label, [], []); // (nodes, edges) — both empty until a live source exists
      const graphB = buildEgoGraph(entityB.address, entityB.label, [], []);
      overlap = computeCounterpartyOverlap(graphA.counterparties, graphB.counterparties);
      categoryMixA = summarizeCategoryMix(graphA.counterparties);
      categoryMixB = summarizeCategoryMix(graphB.counterparties);
    }

    setError("");
    setResult({ a: entityA, b: entityB, overlap, categoryMixA, categoryMixB });
    if (syncUrl) updateCompareUrl(a, b);
  };

  useEffect(() => {
    if (typeof window === "undefined" || !data) return;
    const params = new URLSearchParams(window.location.search);
    const pair = parseCompareParam(params.get(COMPARE_PARAM));
    if (!pair) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAddressA(pair[0]);
    setAddressB(pair[1]);
    runComparison(pair[0], pair[1], false);
    // Only on first load once data is ready — further runs are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(data)]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    runComparison(addressA, addressB, true);
  };

  return (
    <section aria-label="Address comparison" className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <h2 className="text-sm font-medium text-zinc-100">Compare two addresses</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Side-by-side view for the active period.
        {flowViewEnabled
          ? " Counterparty overlap and category mix are included when Flow data is available."
          : " Enable Flow for counterparty overlap; this view shows op count and category otherwise."}
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-xs text-zinc-400" htmlFor="compare-address-a">
          Address A
          <input
            id="compare-address-a"
            value={addressA}
            onChange={(event) => setAddressA(event.target.value)}
            placeholder="G… or C…"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100"
          />
        </label>
        <label className="min-w-0 flex-1 text-xs text-zinc-400" htmlFor="compare-address-b">
          Address B
          <input
            id="compare-address-b"
            value={addressB}
            onChange={(event) => setAddressB(event.target.value)}
            placeholder="G… or C…"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100"
          />
        </label>
        <Button type="submit">Compare</Button>
      </form>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th scope="col" className="py-2 pr-3">
                  Metric
                </th>
                <th scope="col" className="py-2 pr-3 font-mono">
                  {result.a.label}
                </th>
                <th scope="col" className="py-2 pr-3 font-mono">
                  {result.b.label}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-900">
                <td className="py-2 pr-3 text-zinc-400">Found in loaded data</td>
                <td className="py-2 pr-3">{result.a.found ? "Yes" : "No"}</td>
                <td className="py-2 pr-3">{result.b.found ? "Yes" : "No"}</td>
              </tr>
              <tr className="border-b border-zinc-900">
                <td className="py-2 pr-3 text-zinc-400">Type</td>
                <td className="py-2 pr-3">{result.a.type ?? "—"}</td>
                <td className="py-2 pr-3">{result.b.type ?? "—"}</td>
              </tr>
              <tr className="border-b border-zinc-900">
                <td className="py-2 pr-3 text-zinc-400">Category</td>
                <td className="py-2 pr-3">{result.a.category ?? "—"}</td>
                <td className="py-2 pr-3">{result.b.category ?? "—"}</td>
              </tr>
              <tr className="border-b border-zinc-900">
                <td className="py-2 pr-3 text-zinc-400">Op count</td>
                <td className="py-2 pr-3">{result.a.opCount !== null ? formatNumber(result.a.opCount) : "—"}</td>
                <td className="py-2 pr-3">{result.b.opCount !== null ? formatNumber(result.b.opCount) : "—"}</td>
              </tr>
              {result.overlap ? (
                <tr className="border-b border-zinc-900">
                  <td className="py-2 pr-3 text-zinc-400">Counterparty overlap</td>
                  <td colSpan={2} className="py-2 pr-3">
                    {result.overlap.overlapping.length} shared, {result.overlap.onlyA.length} only A,{" "}
                    {result.overlap.onlyB.length} only B
                  </td>
                </tr>
              ) : null}
              {result.categoryMixA && result.categoryMixB ? (
                <tr>
                  <td className="py-2 pr-3 align-top text-zinc-400">Counterparty category mix</td>
                  <td className="py-2 pr-3 align-top">
                    {result.categoryMixA.length === 0
                      ? "—"
                      : result.categoryMixA.map((entry) => `${entry.category} (${Math.round(entry.percent)}%)`).join(", ")}
                  </td>
                  <td className="py-2 pr-3 align-top">
                    {result.categoryMixB.length === 0
                      ? "—"
                      : result.categoryMixB.map((entry) => `${entry.category} (${Math.round(entry.percent)}%)`).join(", ")}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
