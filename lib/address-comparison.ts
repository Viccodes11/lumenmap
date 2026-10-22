import { normalizeWatchlistAddress, resolveWatchlistKind } from "@/lib/watchlist";

export type AddressComparisonPair = [string, string];
export type AddressCategory = { name: string; opCount: number };
export type AddressCounterparty = { address: string; label: string; opCount: number };
export type AddressProfile = {
  address: string;
  opCount: number;
  categories: AddressCategory[];
  counterparties: AddressCounterparty[];
  counterpartiesSampled: boolean;
};

export function validateAddressComparison(
  first: string,
  second: string,
): { ok: true; pair: AddressComparisonPair } | { ok: false; error: string } {
  const a = normalizeWatchlistAddress(first);
  const b = normalizeWatchlistAddress(second);
  if (!resolveWatchlistKind(a) || !resolveWatchlistKind(b)) {
    return { ok: false, error: "Enter two valid Stellar account (G…) or contract (C…) addresses." };
  }
  if (a === b) return { ok: false, error: "Choose two different addresses to compare." };
  return { ok: true, pair: [a, b] };
}

export function parseAddressComparisonParam(value: string | null):
  | { ok: true; pair: AddressComparisonPair }
  | { ok: false; error: string } {
  const parts = value?.split(",") ?? [];
  if (parts.length !== 2) return { ok: false, error: "Comparison link must contain exactly two addresses." };
  return validateAddressComparison(parts[0], parts[1]);
}

export function compareCounterparties(a: AddressProfile, b: AddressProfile) {
  const byAddress = new Map(b.counterparties.map((row) => [row.address, row]));
  const shared = a.counterparties.flatMap((row) => {
    const other = byAddress.get(row.address);
    return other ? [{ address: row.address, label: row.label, aOps: row.opCount, bOps: other.opCount }] : [];
  });
  shared.sort((left, right) =>
    Math.min(right.aOps, right.bOps) - Math.min(left.aOps, left.bOps) || left.address.localeCompare(right.address),
  );
  return {
    shared,
    aOnly: a.counterparties.filter((row) => !byAddress.has(row.address)),
    bOnly: b.counterparties.filter((row) => !a.counterparties.some((item) => item.address === row.address)),
  };
}
