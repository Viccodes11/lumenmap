"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ISSUER_FIXTURE_EVENTS } from "@/lib/fixtures/issuers";
import { aggregateIssuers, type IssuerAggregate, type IssuerSort } from "@/lib/issuers/aggregate";
import { buildStellarExpertUrl } from "@/lib/stellar-expert";
import entities from "@/data/entities.json";

const names = entities as Record<string, { name: string }>;

export function IssuerIntelligence() {
  const [sort, setSort] = useState<IssuerSort>("volume");
  const [selected, setSelected] = useState<IssuerAggregate | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const rows = aggregateIssuers(ISSUER_FIXTURE_EVENTS, names, sort);

  async function copyAddress(issuer: string) {
    try {
      await navigator.clipboard.writeText(issuer);
      setCopied(issuer);
    } catch {
      setCopied(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asset issuers</CardTitle>
        <p className="text-xs text-zinc-400">
          Payment volume and trustline operations. Unknown issuers stay truncated.
          This view does not include holder counts, prices, or market cap.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <button type="button" className="rounded border border-white/15 px-2 py-1 text-xs" onClick={() => setSort("volume")}>
            Sort by volume
          </button>
          <button type="button" className="rounded border border-white/15 px-2 py-1 text-xs" onClick={() => setSort("ops")}>
            Sort by ops
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[36rem] w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-2 pr-3">Issuer</th>
                <th className="py-2 pr-3">Volume</th>
                <th className="py-2 pr-3">Trustline ops</th>
                <th className="py-2">Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.issuer} className="border-t border-white/10">
                  <td className="py-2 pr-3">
                    <button type="button" className="text-left text-stellar-light" onClick={() => setSelected(row)}>
                      {row.displayAddress}
                    </button>
                    {row.name ? null : (
                      <button
                        type="button"
                        className="ml-2 text-xs text-zinc-400 underline"
                        onClick={() => copyAddress(row.copyAddress)}
                      >
                        {copied === row.copyAddress ? "Copied" : "Copy"}
                      </button>
                    )}
                  </td>
                  <td className="py-2 pr-3">{row.paymentVolume.toLocaleString("en-US")}</td>
                  <td className="py-2 pr-3">{row.trustlineOps.toLocaleString("en-US")}</td>
                  <td className="py-2">{Math.round(row.opShare * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selected ? (
          <aside className="rounded-lg border border-white/10 p-4" data-testid="issuer-drawer">
            <p className="font-medium">{selected.displayAddress}</p>
            <p className="mt-1 text-xs text-zinc-400">Assets: {selected.assets.join(", ")}</p>
            <p className="text-xs text-zinc-400">Op share: {Math.round(selected.opShare * 100)}%</p>
            {buildStellarExpertUrl(selected.issuer, "account", "public") ? (
              <a
                className="mt-2 inline-block text-xs underline"
                href={buildStellarExpertUrl(selected.issuer, "account", "public") ?? "#"}
                target="_blank"
                rel="noreferrer"
              >
                Stellar Expert
              </a>
            ) : null}
          </aside>
        ) : null}
      </CardContent>
    </Card>
  );
}
