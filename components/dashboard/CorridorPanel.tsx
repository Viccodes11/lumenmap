"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildCorridors, serializeCorridorsToCsv, DEFAULT_CORRIDOR_ASSET_KEY } from "@/lib/flow/corridors";
import { downloadBlob, generateSafeFilename } from "@/lib/export-utils";
import { PERIOD_OPTIONS } from "@/lib/periods";
import { formatExactNumber, formatPercent } from "@/lib/utils";
import type { Period } from "@/lib/types";
import type { FlowEdge, FlowNode } from "@/lib/flow/graph";

interface FlowApiResponse {
  period: Period;
  source: "fixture" | "hubble";
  sampled: boolean;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

async function fetchFlow(period: Period): Promise<FlowApiResponse> {
  const response = await fetch(`/api/v1/flow?period=${encodeURIComponent(period)}`);
  if (!response.ok) {
    throw new Error(`Flow request failed (HTTP ${response.status})`);
  }
  return (await response.json()) as FlowApiResponse;
}

/**
 * Top XLM remittance corridors (source entity/address -> destination
 * entity/address), aggregated client-side from `/api/v1/flow` via
 * `buildCorridors` (`lib/flow/corridors.ts`). Deliberately standalone: it
 * does not depend on `DashboardProvider` or the Flow MVP components, so it
 * renders correctly regardless of their state.
 */
export function CorridorPanel() {
  const [period, setPeriod] = useState<Period>("7d");
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["flow-corridors", period],
    queryFn: () => fetchFlow(period),
  });

  const table = useMemo(() => {
    if (!data) return null;
    return buildCorridors({ edges: data.edges }, { assetKey: DEFAULT_CORRIDOR_ASSET_KEY });
  }, [data]);

  const handleExportCsv = () => {
    if (!table) return;
    const csv = serializeCorridorsToCsv(table);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    downloadBlob(blob, generateSafeFilename("lumenmap-corridors", "xlm-corridors", period, "csv"));
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Remittance corridors (XLM)</CardTitle>
          <p className="mt-1 text-xs text-text-muted">
            Top source → destination pairs for native XLM payments, clustered by known entity
            where available. See{" "}
            <code className="rounded bg-surface-muted px-1 py-0.5">docs/remittance-corridors.md</code>{" "}
            for the clustering methodology.
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label="Period"
          className="flex gap-1 rounded-lg border border-border bg-surface-muted p-1"
        >
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={period === option.value}
              onClick={() => setPeriod(option.value)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                period === option.value
                  ? "bg-surface-accent-strong text-foreground"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading corridors">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : isError ? (
          <div role="alert" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-status-danger">
              Could not load flow data{error instanceof Error ? `: ${error.message}` : "."}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              Retry
            </Button>
          </div>
        ) : !table || table.rows.length === 0 ? (
          <p className="text-sm text-text-muted">No XLM payment corridors in this period.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
              <span>
                Showing {table.rows.length} of {table.totalCorridorCount} corridor
                {table.totalCorridorCount === 1 ? "" : "s"} ({formatPercent(
                  table.totalOperationCount > 0
                    ? (table.includedOperationCount / table.totalOperationCount) * 100
                    : 0,
                )}{" "}
                of operations represented)
                {data?.sampled ? " — underlying edges were already sampled server-side" : ""}
                .
              </span>
              <Button variant="outline" size="sm" onClick={handleExportCsv} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Top XLM remittance corridors for the selected period</caption>
                <thead>
                  <tr className="border-b border-border text-xs text-text-muted">
                    <th scope="col" className="py-2 pr-3 font-medium">Source</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Destination</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Operations</th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">Volume (stroops)</th>
                    <th scope="col" className="py-2 text-right font-medium">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <tr key={`${row.source.id}->${row.destination.id}`} className="border-b border-border-muted">
                      {/* .label already falls back to a truncated address for an unlabeled
                          account (see resolveCluster in lib/flow/corridors.ts) — do not
                          truncate it again here. */}
                      <td className="py-2 pr-3 text-text-primary">{row.source.label}</td>
                      <td className="py-2 pr-3 text-text-primary">{row.destination.label}</td>
                      <td className="py-2 pr-3 text-right font-mono text-text-secondary">
                        {formatExactNumber(row.operationCount)}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono text-text-secondary">
                        {formatExactNumber(Number(row.volume))}
                      </td>
                      <td className="py-2 text-right font-mono text-text-secondary">{formatPercent(row.share * 100)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
