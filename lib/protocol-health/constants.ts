/**
 * Composite protocol health score (methodology v1.0.0).
 *
 * Each component is min-max normalized to 0–100 inside the scored cohort.
 * A missing component is `unavailable` and is dropped from the weighted sum;
 * its weight is removed from the denominator. It is never substituted with 0.
 * The composite is therefore 0–100 over the components that actually have input.
 *
 * Weights are basis points so 0.35 + 0.25 + 0.25 + 0.15 stays exact.
 */

export const PROTOCOL_HEALTH_METHODOLOGY_VERSION = "1.0.0";

export const PROTOCOL_HEALTH_METHODOLOGY_HREF = "/methodology#protocol-health";

export const PROTOCOL_HEALTH_MISSING_INPUT = "drop-and-renormalize" as const;

/** How many scorecards the dashboard renders. Scoring still uses the full cohort. */
export const PROTOCOL_HEALTH_DISPLAY_LIMIT = 6;

export const PROTOCOL_HEALTH_COMPONENTS = [
  "ops",
  "wallets",
  "volume",
  "tvl",
] as const;

export type ProtocolHealthComponentId =
  (typeof PROTOCOL_HEALTH_COMPONENTS)[number];

/** Integer weights that sum to 100. */
export const PROTOCOL_HEALTH_WEIGHT_BPS = {
  ops: 35,
  wallets: 25,
  volume: 25,
  tvl: 15,
} as const satisfies Record<ProtocolHealthComponentId, number>;

/** Documented decimal weights. Kept as literals so the API schema can pin them. */
export const PROTOCOL_HEALTH_WEIGHTS = {
  ops: 0.35,
  wallets: 0.25,
  volume: 0.25,
  tvl: 0.15,
} as const satisfies Record<ProtocolHealthComponentId, number>;

export const PROTOCOL_HEALTH_UNITS = {
  ops: "operations",
  wallets: "entities",
  volume: "XLM",
  tvl: "USD",
} as const satisfies Record<ProtocolHealthComponentId, string>;

export const PROTOCOL_HEALTH_COMPONENT_LABELS = {
  ops: "Operations",
  wallets: "Wallets",
  volume: "Volume",
  tvl: "TVL",
} as const satisfies Record<ProtocolHealthComponentId, string>;
