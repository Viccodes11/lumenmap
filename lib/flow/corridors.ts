import { getDisplayName, lookupEntity } from "@/lib/entities/registry";
import type { FlowEdge, FlowGraph } from "./graph";

/** The issue this ships for is "top XLM payment pairs" — this is the default filter, not a hard limit; `buildCorridors` works for any asset key. */
export const DEFAULT_CORRIDOR_ASSET_KEY = "native:XLM";

export const DEFAULT_CORRIDOR_TOP_N = 20;

/**
 * A corridor endpoint. Addresses that resolve to the same registry entity
 * (same `protocol`, e.g. two Soroswap pool/router contracts, or two MintX
 * issuer accounts) share one cluster id, so their edges to a shared
 * counterparty merge into a single corridor row. An unlabeled address is
 * never merged with another unlabeled address — see
 * `docs/remittance-corridors.md` for why.
 */
export interface CorridorCluster {
  /** Stable grouping key: `entity:<protocol>` or `account:<accountId>`. */
  id: string;
  /** Entity name, or a truncated account id when unlabeled. */
  label: string;
  /** True when this came from the entity registry rather than a raw address. */
  labeled: boolean;
}

export interface CorridorRow {
  source: CorridorCluster;
  destination: CorridorCluster;
  assetKey: string;
  assetCode: string;
  operationCount: number;
  /** Minor-unit amount, summed as a bigint and rendered as a decimal string — never a float, consistent with `FlowEdge.amount`. */
  volume: string;
  /** This row's operationCount as a share of `totalOperationCount`, in [0, 1]. */
  share: number;
}

export interface CorridorTable {
  assetKey: string;
  rows: CorridorRow[];
  /** Distinct (source cluster, destination cluster) corridors found for this asset, before the top-N cap. */
  totalCorridorCount: number;
  /** Operation count across every corridor for this asset, before the cap. */
  totalOperationCount: number;
  /** Operation count represented by the rows actually returned (after the cap). */
  includedOperationCount: number;
  /** True when totalCorridorCount exceeded topN — `rows` is a top-N sample, not the full set. */
  capped: boolean;
}

export interface BuildCorridorsOptions {
  /** Flow edge asset key to build corridors for. Defaults to native XLM. */
  assetKey?: string;
  /** Maximum corridor rows returned, ranked by operation count. Defaults to 20. */
  topN?: number;
}

function resolveCluster(accountId: string): CorridorCluster {
  const entity = lookupEntity(accountId);
  if (entity) {
    return { id: `entity:${entity.protocol}`, label: entity.name, labeled: true };
  }
  return { id: `account:${accountId}`, label: getDisplayName(accountId), labeled: false };
}

/** Parses a `FlowEdge.amount` minor-unit string defensively; malformed input contributes 0 rather than throwing. */
function parseAmount(amount: string): bigint {
  if (!/^\d+$/.test(amount.trim())) {
    return BigInt(0);
  }
  try {
    return BigInt(amount.trim());
  } catch {
    return BigInt(0);
  }
}

interface MutableCorridor {
  source: CorridorCluster;
  destination: CorridorCluster;
  assetCode: string;
  operationCount: number;
  volume: bigint;
}

/**
 * Aggregates flow edges into source-cluster -> destination-cluster
 * corridors for one asset. Pure and side-effect free: safe to call from a
 * client component, a route handler, or a test.
 *
 * - Unlabeled addresses fall back to a truncated id (`resolveCluster`) and
 *   are never dropped or merged with other unlabeled addresses — an
 *   unrecognized counterparty still renders, it just isn't grouped.
 * - A corridor between two addresses that resolve to the *same* cluster
 *   (e.g. two hot wallets of one exchange) is dropped — that's internal
 *   movement, not a remittance corridor between two parties.
 */
export function buildCorridors(
  graph: Pick<FlowGraph, "edges">,
  options: BuildCorridorsOptions = {},
): CorridorTable {
  const assetKey = options.assetKey ?? DEFAULT_CORRIDOR_ASSET_KEY;
  const topN =
    options.topN !== undefined && Number.isFinite(options.topN) && options.topN > 0
      ? Math.floor(options.topN)
      : DEFAULT_CORRIDOR_TOP_N;

  const matching: FlowEdge[] = graph.edges.filter((edge) => edge.assetKey === assetKey);

  const grouped = new Map<string, MutableCorridor>();
  let totalOperationCount = 0;

  for (const edge of matching) {
    totalOperationCount += edge.operationCount;

    const source = resolveCluster(edge.source);
    const destination = resolveCluster(edge.destination);
    if (source.id === destination.id) {
      continue;
    }

    const key = `${source.id}->${destination.id}`;
    const amount = parseAmount(edge.amount);
    const existing = grouped.get(key);
    if (existing) {
      existing.operationCount += edge.operationCount;
      existing.volume += amount;
    } else {
      grouped.set(key, {
        source,
        destination,
        assetCode: edge.asset.code,
        operationCount: edge.operationCount,
        volume: amount,
      });
    }
  }

  const allRows = Array.from(grouped.values()).sort((a, b) => b.operationCount - a.operationCount);
  const totalCorridorCount = allRows.length;
  const included = allRows.slice(0, topN);
  const includedOperationCount = included.reduce((sum, row) => sum + row.operationCount, 0);

  return {
    assetKey,
    totalCorridorCount,
    totalOperationCount,
    includedOperationCount,
    capped: totalCorridorCount > topN,
    rows: included.map((row) => ({
      source: row.source,
      destination: row.destination,
      assetKey,
      assetCode: row.assetCode,
      operationCount: row.operationCount,
      volume: row.volume.toString(),
      share: totalOperationCount > 0 ? row.operationCount / totalOperationCount : 0,
    })),
  };
}

function escapeCsvField(value: string | number): string {
  const str = String(value);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Serializes a corridor table to CSV, mirroring `serializeFlowEdgesToCsv`'s escaping in `lib/export-utils.ts`. */
export function serializeCorridorsToCsv(table: CorridorTable): string {
  const header = "source,destination,asset,operation_count,volume,share";
  if (table.rows.length === 0) {
    return `${header}\n`;
  }
  const rows = table.rows.map((row) =>
    [
      escapeCsvField(row.source.label),
      escapeCsvField(row.destination.label),
      escapeCsvField(row.assetCode),
      escapeCsvField(row.operationCount),
      escapeCsvField(row.volume),
      escapeCsvField(row.share.toFixed(6)),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}
