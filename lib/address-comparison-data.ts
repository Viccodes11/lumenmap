import { getBigQueryClient } from "@/lib/hubble/client";
import { getMaxBytesBilledLimit } from "@/lib/hubble/config";
import { resolveDataSource } from "@/lib/data-source";
import { FIXTURE_PERIOD_MULTIPLIERS, getFixtureRawActivity } from "@/lib/fixtures/raw-data";
import { getFlowData } from "@/lib/flow/data";
import { resolveHubbleDataset, type DashboardNetworkId } from "@/lib/network";
import { resolvePeriod } from "@/lib/periods";
import type { Period } from "@/lib/types";
import { resolveWatchlistKind } from "@/lib/watchlist";
import type { AddressCategory, AddressCounterparty, AddressProfile } from "@/lib/address-comparison";

export function addressCategoriesQuery(dataset: string, kind: "account" | "contract"): string {
  if (!/^[\w-]+\.[\w-]+$/.test(dataset)) throw new Error("Invalid Hubble dataset configuration");
  const field = kind === "account" ? "op_source_account" : "contract_id";
  return `SELECT type_string AS name, COUNT(*) AS op_count
FROM \`${dataset}.enriched_history_operations\`
WHERE @start <= closed_at AND closed_at < @end AND ${field} = @address
GROUP BY type_string ORDER BY op_count DESC, name ASC`;
}

function fixtureCategories(address: string, period: Period, kind: "account" | "contract"): AddressCategory[] {
  const rows = getFixtureRawActivity(period);
  if (kind === "contract") {
    const count = rows.contracts.find((row) => row.contract_id === address)?.op_count ?? 0;
    return count ? [{ name: "invoke_host_function", opCount: count }] : [];
  }
  return rows.accounts.filter((row) => row.account_id === address)
    .map((row) => ({ name: row.type_string, opCount: row.op_count }))
    .sort((a, b) => b.opCount - a.opCount || a.name.localeCompare(b.name));
}

async function liveCategories(address: string, period: Period, network: DashboardNetworkId, kind: "account" | "contract"): Promise<AddressCategory[]> {
  const client = getBigQueryClient();
  if (!client) throw new Error("BigQuery client is not configured");
  const range = resolvePeriod(period);
  const [job] = await client.createQueryJob({
    query: addressCategoriesQuery(resolveHubbleDataset(network), kind),
    params: { start: range.start.toISOString(), end: range.end.toISOString(), address },
    maximumBytesBilled: getMaxBytesBilledLimit().toString(),
  });
  const [rows] = await job.getQueryResults();
  return (rows as Array<{ name: string; op_count: number }>).map((row) => ({
    name: String(row.name), opCount: Number(row.op_count),
  }));
}

export async function getAddressProfile(address: string, period: Period, network: DashboardNetworkId): Promise<AddressProfile> {
  const kind = resolveWatchlistKind(address);
  if (!kind) throw new Error("Invalid address");
  const fixture = resolveDataSource() === "fixture";
  const [categories, flow] = await Promise.all([
    fixture ? fixtureCategories(address, period, kind) : liveCategories(address, period, network, kind),
    kind === "account" ? getFlowData(period, network, address) : Promise.resolve(null),
  ]);
  const totals = new Map<string, AddressCounterparty>();
  for (const edge of flow?.edges ?? []) {
    const other = edge.source === address ? edge.destination : edge.source;
    const previous = totals.get(other);
    totals.set(other, {
      address: other,
      label: flow?.nodes.find((node) => node.id === other)?.label ?? other,
      opCount: (previous?.opCount ?? 0) + edge.operationCount * (fixture ? FIXTURE_PERIOD_MULTIPLIERS[period] : 1),
    });
  }
  return {
    address,
    opCount: categories.reduce((sum, category) => sum + category.opCount, 0),
    categories,
    counterparties: [...totals.values()].sort((a, b) => b.opCount - a.opCount || a.address.localeCompare(b.address)).slice(0, 10),
    counterpartiesSampled: flow?.sampled ?? false,
  };
}
