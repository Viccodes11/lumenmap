import {
  PROTOCOL_HEALTH_COMPONENTS,
  PROTOCOL_HEALTH_UNITS,
  PROTOCOL_HEALTH_WEIGHTS,
  PROTOCOL_HEALTH_WEIGHT_BPS,
  type ProtocolHealthComponentId,
} from "@/lib/protocol-health/constants";

export interface ProtocolHealthRawInput {
  protocol: string;
  /** Closed operations attributed to the protocol. Null when activity is absent. */
  ops: number | null;
  /** Distinct labeled accounts and contracts. Null when activity is absent. */
  wallets: number | null;
  /** Native XLM volume. Null when the volume field was not measured. */
  volumeXlm: number | null;
  /** Adapter TVL in USD. Null when no usable snapshot exists. */
  tvlUsd: number | null;
  /** Optional sparkline points. Omitted from the score. */
  timeseries?: number[];
  /** Representative account or contract for the existing detail panel. */
  entityId?: string;
}

export interface ProtocolHealthComponentScore {
  id: ProtocolHealthComponentId;
  weight: number;
  status: "available" | "unavailable";
  value: number | null;
  unit: string;
  /** Cohort min-max score, 0–100, rounded to one decimal. Null when unavailable. */
  score: number | null;
}

export interface ScoredProtocol {
  protocol: string;
  rank: number;
  /** Renormalized composite, or null when every component is unavailable. */
  score: number | null;
  components: Record<ProtocolHealthComponentId, ProtocolHealthComponentScore>;
  timeseries?: number[];
  entityId?: string;
}

function measured(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export function roundHealthScore(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 10) / 10;
  return Math.min(100, Math.max(0, rounded));
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) {
    return value > 0 ? 100 : 0;
  }
  return ((value - min) / (max - min)) * 100;
}

function sparkline(values: number[] | undefined): number[] | undefined {
  if (!values || values.length < 2) {
    return undefined;
  }
  const points = values.filter((value) => Number.isFinite(value));
  return points.length >= 2 ? points : undefined;
}

interface PreparedRow {
  protocol: string;
  values: Record<ProtocolHealthComponentId, number | null>;
  timeseries?: number[];
  entityId?: string;
}

function prepare(inputs: ProtocolHealthRawInput[]): PreparedRow[] {
  const byKey = new Map<string, PreparedRow>();

  for (const input of inputs) {
    const protocol = input.protocol.trim();
    if (!protocol || protocol.toLowerCase() === "unknown") {
      continue;
    }
    const key = protocol.toLowerCase();
    if (byKey.has(key)) {
      continue;
    }
    byKey.set(key, {
      protocol,
      values: {
        ops: measured(input.ops),
        wallets: measured(input.wallets),
        volume: measured(input.volumeXlm),
        tvl: measured(input.tvlUsd),
      },
      timeseries: sparkline(input.timeseries),
      entityId: input.entityId,
    });
  }

  return [...byKey.values()];
}

/**
 * Score a cohort. Missing TVL (or any other component) does not zero the
 * composite: that component is marked unavailable and its weight is dropped.
 */
export function scoreProtocolCohort(
  inputs: ProtocolHealthRawInput[],
): ScoredProtocol[] {
  const rows = prepare(inputs);
  const ranges = new Map<
    ProtocolHealthComponentId,
    { min: number; max: number }
  >();

  for (const id of PROTOCOL_HEALTH_COMPONENTS) {
    const values = rows
      .map((row) => row.values[id])
      .filter((value): value is number => value != null);
    if (values.length === 0) {
      continue;
    }
    ranges.set(id, {
      min: Math.min(...values),
      max: Math.max(...values),
    });
  }

  const scored = rows.map((row) => {
    const components = {} as Record<
      ProtocolHealthComponentId,
      ProtocolHealthComponentScore
    >;
    let weighted = 0;
    let weightSum = 0;

    for (const id of PROTOCOL_HEALTH_COMPONENTS) {
      const value = row.values[id];
      const range = ranges.get(id);
      if (value == null || !range) {
        components[id] = {
          id,
          weight: PROTOCOL_HEALTH_WEIGHTS[id],
          status: "unavailable",
          value: null,
          unit: PROTOCOL_HEALTH_UNITS[id],
          score: null,
        };
        continue;
      }

      const score = roundHealthScore(normalize(value, range.min, range.max));
      components[id] = {
        id,
        weight: PROTOCOL_HEALTH_WEIGHTS[id],
        status: "available",
        value,
        unit: PROTOCOL_HEALTH_UNITS[id],
        score,
      };
      weighted += score * PROTOCOL_HEALTH_WEIGHT_BPS[id];
      weightSum += PROTOCOL_HEALTH_WEIGHT_BPS[id];
    }

    return {
      protocol: row.protocol,
      rank: 0,
      score: weightSum === 0 ? null : roundHealthScore(weighted / weightSum),
      components,
      timeseries: row.timeseries,
      entityId: row.entityId,
    };
  });

  scored.sort((left, right) => {
    if (left.score == null && right.score == null) {
      return left.protocol.localeCompare(right.protocol);
    }
    if (left.score == null) return 1;
    if (right.score == null) return -1;
    if (left.score !== right.score) return right.score - left.score;
    return left.protocol.localeCompare(right.protocol);
  });

  return scored.map((row, index) => ({ ...row, rank: index + 1 }));
}
