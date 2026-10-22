"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { Button } from "@/components/ui/button";
import {
  compareCounterparties,
  parseAddressComparisonParam,
  validateAddressComparison,
  type AddressComparisonPair,
  type AddressProfile,
} from "@/lib/address-comparison";
import { isValidPeriod } from "@/lib/periods";
import { formatNumber } from "@/lib/utils";

type ComparisonResponse = { a: AddressProfile; b: AddressProfile };

async function fetchComparison(a: string, b: string, period: string, network: string): Promise<ComparisonResponse> {
  const params = new URLSearchParams({ a, b, period, network });
  const response = await fetch(`/api/v1/address-comparison?${params}`);
  if (!response.ok) {
    const body = await response.json() as { message?: string };
    throw new Error(body.message ?? "Address comparison is unavailable.");
  }
  return response.json() as Promise<ComparisonResponse>;
}

function ProfileColumn({ profile, title }: { profile: AddressProfile; title: string }) {
  return (
    <section className="min-w-0 rounded-lg border border-zinc-800 bg-black/20 p-4">
      <h3 className="font-semibold text-white">{title}</h3>
      <p className="mt-1 break-all font-mono text-xs text-zinc-400">{profile.address}</p>
      <p className="mt-3 text-2xl font-semibold text-white">{formatNumber(profile.opCount)} <span className="text-sm font-normal text-zinc-400">operations</span></p>
      <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Operation category mix</h4>
      {profile.categories.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No operations found in this period.</p> : (
        <ul className="mt-2 space-y-2">
          {profile.categories.slice(0, 8).map((row) => (
            <li key={row.name} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 break-words text-zinc-300">{row.name}</span>
              <span className="shrink-0 font-mono text-zinc-100">{formatNumber(row.opCount)} ({Math.round(row.opCount / profile.opCount * 100)}%)</span>
            </li>
          ))}
        </ul>
      )}
      <h4 className="mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-400">Top payment counterparties</h4>
      {profile.counterparties.length === 0 ? <p className="mt-2 text-sm text-zinc-500">No payment counterparties in the available data.</p> : (
        <ul className="mt-2 space-y-2">
          {profile.counterparties.map((row) => (
            <li key={row.address} className="flex justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-zinc-300" title={row.address}>{row.label}</span>
              <span className="shrink-0 font-mono text-zinc-100">{formatNumber(row.opCount)} ops</span>
            </li>
          ))}
        </ul>
      )}
      {profile.counterpartiesSampled ? <p className="mt-2 text-xs text-amber-200">Counterparties are sampled from the top 100 payment edges.</p> : null}
    </section>
  );
}

export function AddressComparisonPanel() {
  const { period, network, comparePeriod, setComparePeriod } = useDashboard();
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [pair, setPair] = useState<AddressComparisonPair | null>(null);
  const [inputError, setInputError] = useState("");

  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("compare");
    if (!raw || isValidPeriod(raw)) return;
    const parts = raw.split(",");
    queueMicrotask(() => {
      setFirst(parts[0] ?? "");
      setSecond(parts[1] ?? "");
      const parsed = parseAddressComparisonParam(raw);
      if (parsed.ok) setPair(parsed.pair);
      else setInputError(parsed.error);
    });
  }, []);

  useEffect(() => {
    if (!comparePeriod) return;
    queueMicrotask(() => {
      setPair(null);
      setFirst("");
      setSecond("");
      setInputError("");
    });
  }, [comparePeriod]);

  const query = useQuery({
    queryKey: ["address-comparison", pair?.[0], pair?.[1], period, network],
    queryFn: () => fetchComparison(pair![0], pair![1], period, network),
    enabled: pair !== null,
    staleTime: 60_000,
  });

  const apply = () => {
    const result = validateAddressComparison(first, second);
    if (!result.ok) { setInputError(result.error); return; }
    setInputError("");
    setPair(result.pair);
    setFirst(result.pair[0]);
    setSecond(result.pair[1]);
    setComparePeriod(null);
    const params = new URLSearchParams(window.location.search);
    params.set("compare", result.pair.join(","));
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}`);
  };

  const clear = () => {
    setPair(null);
    setFirst("");
    setSecond("");
    setInputError("");
    const params = new URLSearchParams(window.location.search);
    params.delete("compare");
    window.history.replaceState(window.history.state, "", `${window.location.pathname}?${params}`);
  };

  const overlap = query.data ? compareCounterparties(query.data.a, query.data.b) : null;

  return (
    <section aria-label="Address comparison" className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <h2 className="text-base font-semibold text-white">Compare two addresses</h2>
      <p className="mt-1 text-xs text-zinc-400">Operations and payment counterparties for the active {period} period on {network}. Works without Flow view.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-zinc-400">Address A
          <input value={first} onChange={(event) => setFirst(event.target.value)} placeholder="G… or C…" spellCheck={false} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-white" />
        </label>
        <label className="text-xs text-zinc-400">Address B
          <input value={second} onChange={(event) => setSecond(event.target.value)} placeholder="G… or C…" spellCheck={false} className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-white" />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="button" size="sm" onClick={apply}>Compare addresses</Button>
        {pair ? <Button type="button" size="sm" variant="outline" onClick={clear}>Clear comparison</Button> : null}
      </div>
      {inputError ? <p role="alert" className="mt-3 text-sm text-rose-300">{inputError}</p> : null}
      {query.isPending && pair ? <p role="status" className="mt-4 text-sm text-zinc-400">Loading address comparison…</p> : null}
      {query.error && pair ? <p role="alert" className="mt-4 text-sm text-rose-300">{query.error.message}</p> : null}
      {query.data && pair ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ProfileColumn profile={query.data.a} title="Address A" />
            <ProfileColumn profile={query.data.b} title="Address B" />
          </div>
          <div className="rounded-lg border border-zinc-800 bg-black/20 p-4">
            <h3 className="font-semibold text-white">Shared payment counterparties: {overlap?.shared.length ?? 0}</h3>
            {overlap?.shared.length ? (
              <ul className="mt-2 space-y-2 text-sm">
                {overlap.shared.map((row) => <li key={row.address} className="flex flex-wrap justify-between gap-2 text-zinc-300"><span title={row.address}>{row.label}</span><span className="font-mono text-xs">A {formatNumber(row.aOps)} · B {formatNumber(row.bOps)} ops</span></li>)}
              </ul>
            ) : <p className="mt-2 text-sm text-zinc-400">No shared payment counterparties in the available data.</p>}
            <p className="mt-3 text-xs text-zinc-500">Only A: {overlap?.aOnly.length ?? 0} · Only B: {overlap?.bOnly.length ?? 0}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
