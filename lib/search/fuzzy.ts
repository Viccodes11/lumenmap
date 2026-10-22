/**
 * Typo-tolerant matching for entity search.
 *
 * Deliberately simple (a bounded edit-distance table, no external
 * dependency): the registry is small enough that an O(n*m) distance check
 * per candidate word is cheap, and the caller (`searchIndex` in
 * `query.ts`) only reaches this as a fallback after cheaper exact/prefix/
 * substring checks have already failed.
 */

/**
 * How many edits a query of this length is allowed to differ by before a
 * term is considered a typo match, rather than an unrelated word. Short
 * queries get zero tolerance — "cat" and "car" differ by one edit but
 * treating every 3-letter query as fuzzy-matchable would flood results
 * with unrelated terms.
 */
export function maxTypoDistance(queryLength: number): number {
  if (queryLength <= 3) return 0;
  if (queryLength <= 7) return 1;
  return 2;
}

/**
 * Optimal-string-alignment edit distance between `a` and `b`, bounded by
 * `maxDistance`: insertion, deletion, substitution, and an adjacent
 * transposition (swapped neighboring letters, e.g. "kraken" / "karken")
 * each cost one edit — transposition is counted explicitly, rather than
 * as two substitutions, since it is one of the most common real typo
 * patterns. Returns `maxDistance + 1` as soon as it is certain the true
 * distance exceeds the bound, without finishing the full table.
 */
export function boundedEditDistance(a: string, b: string, maxDistance: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;
  if (maxDistance <= 0) return maxDistance + 1;

  let twoRowsBack: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = current[0];
    for (let j = 1; j <= b.length; j++) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(
        previous[j] + 1, // deletion
        current[j - 1] + 1, // insertion
        previous[j - 1] + substitutionCost, // substitution
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, twoRowsBack[j - 2] + 1); // adjacent transposition
      }
      current.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    twoRowsBack = previous;
    previous = current;
  }

  return previous[b.length];
}

export type FuzzyWordMatch = {
  distance: number;
  /** The whitespace-separated word within `text` that matched, for coarse-grained highlighting. */
  word: string;
};

/**
 * Tries to typo-match `query` (expected already lower-cased) against any
 * whitespace-separated word in `text` (also expected lower-cased), within
 * the length-scaled tolerance. Returns the closest match, or `null`.
 */
export function fuzzyMatchWord(text: string, query: string): FuzzyWordMatch | null {
  if (!query) return null;
  const tolerance = maxTypoDistance(query.length);
  if (tolerance === 0) return null;

  let best: FuzzyWordMatch | null = null;
  for (const word of text.split(/\s+/)) {
    if (!word) continue;
    const distance = boundedEditDistance(word, query, tolerance);
    if (distance <= tolerance && (!best || distance < best.distance)) {
      best = { distance, word };
    }
  }
  return best;
}
