import type { EgoCounterparty } from "@/lib/flow-ego";
import { isValidStellarAccountId, isValidStellarContractId } from "@/lib/stellar-expert";

/** URL search param name for the comparison deep-link, e.g. `?compare=GABC...,CDEF...`. */
export const COMPARE_PARAM = "compare";

export const INVALID_COMPARISON_ADDRESS = "Enter a valid Stellar account (G…) or contract (C…) address.";
export const SAME_ADDRESS_COMPARISON = "Enter two different addresses to compare.";

export function isValidComparisonAddress(address: string): boolean {
  const trimmed = address.trim();
  return isValidStellarAccountId(trimmed) || isValidStellarContractId(trimmed);
}

export type ComparisonValidation = { ok: true } | { ok: false; error: string };

/** Validates both addresses for the comparison view. Rejects an invalid address or a self-comparison with a clear, specific error. */
export function validateComparisonAddresses(addressA: string, addressB: string): ComparisonValidation {
  const a = addressA.trim();
  const b = addressB.trim();
  if (!isValidComparisonAddress(a)) return { ok: false, error: `Address A: ${INVALID_COMPARISON_ADDRESS}` };
  if (!isValidComparisonAddress(b)) return { ok: false, error: `Address B: ${INVALID_COMPARISON_ADDRESS}` };
  if (a.toUpperCase() === b.toUpperCase()) return { ok: false, error: SAME_ADDRESS_COMPARISON };
  return { ok: true };
}

/** Parses the `compare` URL param (`addrA,addrB`) into a pair, or `null` when absent/malformed. */
export function parseCompareParam(value: string | null | undefined): [string, string] | null {
  if (!value) return null;
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  return [parts[0], parts[1]];
}

export function buildCompareParam(addressA: string, addressB: string): string {
  return `${addressA.trim()},${addressB.trim()}`;
}

export type ResolvedComparisonEntity = {
  address: string;
  label: string;
  found: boolean;
  type: string | null;
  category: string | null;
  opCount: number | null;
};

export type EntityLookup = {
  id?: string;
  label: string;
  type: string;
  category?: string;
  opCount?: number;
};

/**
 * Resolves one comparison side against the already-built search index
 * (`@/lib/search`) — the same entity-resolution path `DashboardSearch`
 * and `DetailPanel` already use, so this never needs its own query.
 */
export function resolveComparisonEntity(index: readonly EntityLookup[], address: string): ResolvedComparisonEntity {
  const normalized = address.trim().toUpperCase();
  const match = index.find((entry) => entry.id?.toUpperCase() === normalized);
  return {
    address: normalized,
    label: match?.label ?? address.trim(),
    found: Boolean(match),
    type: match?.type ?? null,
    category: match?.category ?? null,
    opCount: match?.opCount ?? null,
  };
}

export type CounterpartyOverlap = {
  overlapping: string[];
  onlyA: string[];
  onlyB: string[];
};

/**
 * Pure set comparison over two ego graphs' counterparty lists. Ego-graph
 * edge data has no live source yet (see `FlowEgoSection`) — this helper
 * is algorithm-complete and fully covered by fixture counterparties, so
 * it is ready the moment the activity API starts supplying real edges;
 * until then, calling it with empty lists correctly reports no overlap.
 */
export function computeCounterpartyOverlap(
  counterpartiesA: readonly EgoCounterparty[],
  counterpartiesB: readonly EgoCounterparty[],
): CounterpartyOverlap {
  const idsA = new Set(counterpartiesA.map((entry) => entry.id));
  const idsB = new Set(counterpartiesB.map((entry) => entry.id));
  const overlapping = [...idsA].filter((id) => idsB.has(id)).sort();
  const onlyA = [...idsA].filter((id) => !idsB.has(id)).sort();
  const onlyB = [...idsB].filter((id) => !idsA.has(id)).sort();
  return { overlapping, onlyA, onlyB };
}

export type CategoryMixEntry = {
  category: string;
  count: number;
  percent: number;
};

/** Distribution of counterparty categories for one side of the comparison, highest share first. */
export function summarizeCategoryMix(counterparties: readonly EgoCounterparty[]): CategoryMixEntry[] {
  if (counterparties.length === 0) return [];
  const counts = new Map<string, number>();
  for (const counterparty of counterparties) {
    const category = counterparty.category ?? "uncategorized";
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const total = counterparties.length;
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count, percent: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}
