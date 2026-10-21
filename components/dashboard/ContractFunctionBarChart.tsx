"use client";

import type { ContractFunctionBreakdownRow } from "@/lib/entities/contract-function-breakdown";
import { formatNumber, formatPercent } from "@/lib/utils";

export interface ContractFunctionBarChartProps {
  rows: ContractFunctionBreakdownRow[];
  configuredLimit: number;
  opsUnitLabel: string;
  /** Called with the row's drill path when a bar is activated (click or Enter/Space). */
  onOpenDrill: (row: ContractFunctionBreakdownRow) => void;
}

/**
 * Horizontal bar list of a contract's top Soroban host functions, ranked by
 * operation count. Bar length is relative to the top row in the list (the
 * top row always fills the track) so the ranking reads clearly even when one
 * function dominates; the exact share of the contract total is still shown
 * as text next to every bar.
 *
 * Pure/presentational: callers own data fetching (`buildContractFunctionBreakdown`
 * in `lib/entities/contract-function-breakdown.ts`) and the empty/unavailable
 * copy for `rows.length === 0` — this component renders nothing for that
 * case rather than a second, possibly-inconsistent empty message.
 */
export function ContractFunctionBarChart({
  rows,
  configuredLimit,
  opsUnitLabel,
  onOpenDrill,
}: ContractFunctionBarChartProps) {
  if (rows.length === 0) {
    return null;
  }

  const maxSharePercent = Math.max(...rows.map((row) => row.sharePercent), 0);

  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">
        Top {configuredLimit} Soroban host functions by operation count ({opsUnitLabel}), ranked
        relative to this contract&apos;s busiest function.
      </p>
      <ul role="list" className="space-y-2">
        {rows.map((row) => {
          const barWidthPercent =
            maxSharePercent > 0 ? (row.sharePercent / maxSharePercent) * 100 : 0;
          return (
            <li key={row.eventType}>
              <button
                type="button"
                onClick={() => onOpenDrill(row)}
                aria-label={`${row.functionName}: ${formatNumber(row.opCount)} ${opsUnitLabel}, ${formatPercent(
                  row.sharePercent,
                )} of this contract's total. Open in treemap.`}
                className="group w-full rounded-md px-1 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className="truncate font-mono text-zinc-200 group-hover:text-white"
                    title={row.functionName}
                  >
                    {row.functionName}
                  </span>
                  <span className="shrink-0 tabular-nums text-zinc-400">
                    {formatNumber(row.opCount)} · {formatPercent(row.sharePercent)}
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10"
                >
                  <div
                    className="h-2 rounded-full bg-stellar transition-[width] group-hover:bg-stellar-light"
                    style={{ width: `${barWidthPercent}%` }}
                  />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
