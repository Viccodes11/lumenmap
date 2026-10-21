import { lookupEntity } from "@/lib/entities/registry";
import {
  PROTOCOL_HEALTH_DISPLAY_LIMIT,
  PROTOCOL_HEALTH_METHODOLOGY_HREF,
  PROTOCOL_HEALTH_METHODOLOGY_VERSION,
  PROTOCOL_HEALTH_MISSING_INPUT,
  PROTOCOL_HEALTH_WEIGHTS,
} from "@/lib/protocol-health/constants";
import { protocolHealthDetailLink } from "@/lib/protocol-health/detail";
import {
  scoreProtocolCohort,
  type ProtocolHealthRawInput,
  type ScoredProtocol,
} from "@/lib/protocol-health/score";
import type { TvlAdapterResult } from "@/lib/tvl/adapter";
import type { AccountRow, ContractRow, DataSource, Period } from "@/lib/types";

export interface ProtocolHealthCard extends Omit<ScoredProtocol, "entityId"> {
  detail: ReturnType<typeof protocolHealthDetailLink>;
}

export interface ProtocolHealthResponse {
  period: Period;
  start: string;
  end: string;
  source: DataSource;
  sourceTimestamp: string;
  isPeriodComplete: boolean;
  fixture?: boolean;
  displayLimit: typeof PROTOCOL_HEALTH_DISPLAY_LIMIT;
  methodology: {
    version: typeof PROTOCOL_HEALTH_METHODOLOGY_VERSION;
    href: typeof PROTOCOL_HEALTH_METHODOLOGY_HREF;
    weights: typeof PROTOCOL_HEALTH_WEIGHTS;
    missingInput: typeof PROTOCOL_HEALTH_MISSING_INPUT;
  };
  protocols: ProtocolHealthCard[];
}

export interface ProtocolHealthMeta {
  period: Period;
  start: string;
  end: string;
  source: DataSource;
  sourceTimestamp: string;
  isPeriodComplete: boolean;
  fixture?: boolean;
}

function usableTvlUsd(result: TvlAdapterResult): number | null {
  if (result.status === "failed" || result.status === "unsupported") {
    return null;
  }
  if (!("positions" in result)) {
    return null;
  }
  const sum = result.positions.reduce(
    (total, position) => total + Number(position.usdValue || 0),
    0,
  );
  if (!Number.isFinite(sum) || sum < 0) {
    return null;
  }
  return sum;
}

/**
 * Build score inputs from the existing activity rows and TVL adapter results.
 * Does not change how TVL itself is calculated.
 */
export function inputsFromActivity(
  accounts: AccountRow[],
  contracts: ContractRow[],
  tvlResults: TvlAdapterResult[],
): ProtocolHealthRawInput[] {
  const volume = new Map<string, number>();
  const volumeSeen = new Set<string>();
  const entityId = new Map<string, string>();
  const names = new Map<string, string>();
  const ops = new Map<string, number>();
  const entities = new Map<string, Set<string>>();
  const seenActivity = new Set<string>();

  const trackActivity = (id: string, protocol: string | undefined, opCount: number) => {
    const name = protocol?.trim();
    if (!name || name.toLowerCase() === "unknown") return;
    const key = name.toLowerCase();
    if (!names.has(key)) names.set(key, name);
    if (!entityId.has(key)) entityId.set(key, id);
    ops.set(key, (ops.get(key) ?? 0) + opCount);
    const members = entities.get(key) ?? new Set<string>();
    members.add(id);
    entities.set(key, members);
    seenActivity.add(key);
  };

  for (const row of accounts) {
    const protocol = lookupEntity(row.account_id)?.protocol;
    trackActivity(row.account_id, protocol, row.op_count);
    if (
      protocol &&
      row.xlm_volume !== undefined &&
      Number.isFinite(row.xlm_volume)
    ) {
      const key = protocol.trim().toLowerCase();
      if (key !== "unknown") {
        volume.set(key, (volume.get(key) ?? 0) + row.xlm_volume);
        volumeSeen.add(key);
      }
    }
  }

  for (const row of contracts) {
    trackActivity(
      row.contract_id,
      lookupEntity(row.contract_id)?.protocol,
      row.op_count,
    );
  }

  const tvlByKey = new Map<string, number | null>();
  for (const result of tvlResults) {
    const name = result.protocol.trim();
    if (!name || name.toLowerCase() === "unknown") continue;
    const key = name.toLowerCase();
    if (!names.has(key)) names.set(key, name);
    tvlByKey.set(key, usableTvlUsd(result));
  }

  return [...names.entries()].map(([key, protocol]) => ({
    protocol,
    ops: seenActivity.has(key) ? (ops.get(key) ?? 0) : null,
    wallets: seenActivity.has(key) ? (entities.get(key)?.size ?? 0) : null,
    volumeXlm: volumeSeen.has(key) ? (volume.get(key) ?? 0) : null,
    tvlUsd: tvlByKey.has(key) ? (tvlByKey.get(key) ?? null) : null,
    entityId: entityId.get(key),
  }));
}

export function packageProtocolHealth(
  meta: ProtocolHealthMeta,
  inputs: ProtocolHealthRawInput[],
): ProtocolHealthResponse {
  const protocols = scoreProtocolCohort(inputs).map((row) => {
    const { entityId, ...rest } = row;
    return {
      ...rest,
      detail: protocolHealthDetailLink(
        row.protocol,
        row.components.tvl.status === "available",
        entityId,
      ),
    };
  });

  return {
    period: meta.period,
    start: meta.start,
    end: meta.end,
    source: meta.source,
    sourceTimestamp: meta.sourceTimestamp,
    isPeriodComplete: meta.isPeriodComplete,
    ...(meta.fixture ? { fixture: true } : {}),
    displayLimit: PROTOCOL_HEALTH_DISPLAY_LIMIT,
    methodology: {
      version: PROTOCOL_HEALTH_METHODOLOGY_VERSION,
      href: PROTOCOL_HEALTH_METHODOLOGY_HREF,
      weights: PROTOCOL_HEALTH_WEIGHTS,
      missingInput: PROTOCOL_HEALTH_MISSING_INPUT,
    },
    protocols,
  };
}
