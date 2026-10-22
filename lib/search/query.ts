import {
  SEARCH_RESULT_TYPE_LABELS,
  type GroupedSearchResults,
  type MatchSpan,
  type SearchIndexEntry,
  type SearchQueryResult,
  type SearchResult,
} from "@/lib/search/types";

const DEFAULT_LIMIT = 40;

function editDistanceWithin(a: string, b: string, maxEdits: number): number | null {
  if (Math.abs(a.length - b.length) > maxEdits) return null;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMinimum = i;
    for (let j = 1; j <= b.length; j += 1) {
      const distance = Math.min(
        previous[j]! + 1,
        current[j - 1]! + 1,
        previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      current.push(distance);
      rowMinimum = Math.min(rowMinimum, distance);
    }
    if (rowMinimum > maxEdits) return null;
    previous = current;
  }
  return previous[b.length]! <= maxEdits ? previous[b.length]! : null;
}

function matchSpans(text: string | undefined, folded: string): MatchSpan[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const direct = lower.indexOf(folded);
  if (direct >= 0) return [{ start: direct, end: direct + folded.length }];
  if (folded.length < 3 || folded.length > 64) return [];

  const maxEdits = folded.length >= 5 ? 2 : 1;
  let best: { span: MatchSpan; distance: number } | null = null;
  for (const match of lower.matchAll(/[a-z0-9]+/g)) {
    const distance = editDistanceWithin(folded, match[0], maxEdits);
    if (distance !== null && (!best || distance < best.distance)) {
      best = {
        span: { start: match.index, end: match.index + match[0].length },
        distance,
      };
    }
  }
  return best ? [best.span] : [];
}

function toResult(entry: SearchIndexEntry, folded: string): SearchResult {
  return {
    key: entry.key,
    type: entry.type,
    label: entry.label,
    subtitle: entry.subtitle,
    id: entry.id,
    assetCode: entry.assetCode,
    issuer: entry.issuer,
    protocol: entry.protocol,
    category: entry.category,
    opCount: entry.opCount,
    treemapView: entry.treemapView,
    nodeType: entry.nodeType,
    highlights: {
      label: matchSpans(entry.label, folded),
      subtitle: matchSpans(entry.subtitle, folded),
    },
  };
}

function scoreEntry(entry: SearchIndexEntry, rawQuery: string, folded: string): number {
  // A pasted canonical address must beat aliases, assets, and protocols that
  // refer to the same id, regardless of activity count.
  if (
    (entry.type === "account" || entry.type === "contract") &&
    entry.id === rawQuery
  ) return 2_000;

  // Exact canonical id (case-sensitive) — deterministic top hit.
  for (const id of entry.exactIds) {
    if (id === rawQuery) {
      return 1_000;
    }
  }

  // Exact id ignoring case.
  for (const id of entry.exactIds) {
    if (id.toLowerCase() === folded) {
      return 900;
    }
  }

  // Exact term match (names / protocols), case-insensitive.
  for (const term of entry.terms) {
    if (term === folded) {
      return 800;
    }
  }

  // Asset code exact match — keep multiple issuers distinguishable, same score band.
  if (entry.type === "asset" && entry.assetCode?.toLowerCase() === folded) {
    return 750;
  }

  // Prefix match on label / protocol.
  if (entry.label.toLowerCase().startsWith(folded)) {
    return 600;
  }
  if (entry.protocol?.toLowerCase().startsWith(folded)) {
    return 580;
  }
  if (entry.assetCode?.toLowerCase().startsWith(folded)) {
    return 560;
  }

  // Substring match on any term.
  for (const term of entry.terms) {
    if (term.includes(folded)) {
      return 400;
    }
  }

  if (entry.subtitle?.toLowerCase().includes(folded)) {
    return 300;
  }

  if (folded.length >= 3 && folded.length <= 64) {
    const maxEdits = folded.length >= 5 ? 2 : 1;
    let best = 0;
    for (const term of entry.fuzzyTerms) {
      if (term.length > 64) continue;
      const distance = editDistanceWithin(folded, term, maxEdits);
      if (distance !== null) best = Math.max(best, 250 - distance * 50);
    }
    return best;
  }

  return 0;
}

/**
 * Query a pre-built search index.
 *
 * - Exact identifiers resolve deterministically (highest score, stable tie-break).
 * - Names and protocols match case-insensitively, with typo tolerance.
 * - Same-code assets remain separate rows distinguished by issuer.
 */
export function searchIndex(
  index: SearchIndexEntry[],
  query: string,
  limit = DEFAULT_LIMIT,
): SearchQueryResult {
  const rawQuery = query.trim();
  if (!rawQuery) {
    return { query: rawQuery, groups: [], total: 0 };
  }

  const folded = rawQuery.toLowerCase();
  const resultLimit = Number.isFinite(limit)
    ? Math.max(0, Math.min(DEFAULT_LIMIT, Math.floor(limit)))
    : DEFAULT_LIMIT;

  const ranked = index
    .map((entry) => ({ entry, score: scoreEntry(entry, rawQuery, folded) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      // Deterministic tie-break: higher activity, then stable key.
      const opDelta = (b.entry.opCount ?? 0) - (a.entry.opCount ?? 0);
      if (opDelta !== 0) {
        return opDelta;
      }
      return a.entry.key.localeCompare(b.entry.key);
    })
    .slice(0, resultLimit)
    .map((row) => toResult(row.entry, folded));

  const byType = new Map<SearchResult["type"], SearchResult[]>();
  for (const result of ranked) {
    const list = byType.get(result.type) ?? [];
    list.push(result);
    byType.set(result.type, list);
  }

  // Map insertion order preserves the score order of each group's first hit.
  const groups: GroupedSearchResults[] = [...byType].map(([type, results]) => ({
    type,
    label: SEARCH_RESULT_TYPE_LABELS[type],
    results,
  }));

  return {
    query: rawQuery,
    groups,
    total: ranked.length,
  };
}
