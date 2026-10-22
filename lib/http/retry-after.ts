/**
 * Client-side helper for honoring a `Retry-After` response header.
 *
 * This server's own rate limiter (`lib/rate-limit.ts`) always sends the
 * delta-seconds form, but per RFC 9110 §10.2.3 a `Retry-After` header may
 * also be an HTTP-date. A well-behaved client should tolerate both forms
 * rather than assuming a specific server's current behavior.
 */

export type RetryAfterForm = "delta-seconds" | "http-date";

export type RetryAfterResult = {
  /** Milliseconds to wait before retrying. Never negative. */
  delayMs: number;
  /** Which form the header was in, or `null` when it was missing or unparseable. */
  form: RetryAfterForm | null;
};

const UNPARSEABLE: RetryAfterResult = { delayMs: 0, form: null };

/** RFC 9110's preferred HTTP-date form, e.g. "Wed, 21 Oct 2015 07:28:00 GMT". */
const IMF_FIXDATE = /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * Parses a raw `Retry-After` header value into a non-negative delay in
 * milliseconds. Returns `{ delayMs: 0, form: null }` for a missing or
 * unparseable value — callers should treat that as "no guidance from the
 * server" and fall back to their own backoff policy, not as "retry
 * immediately".
 */
export function parseRetryAfter(value: string | null | undefined, now: () => number = Date.now): RetryAfterResult {
  if (value === null || value === undefined) return UNPARSEABLE;
  const trimmed = value.trim();
  if (trimmed === "") return UNPARSEABLE;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return { delayMs: Math.max(0, seconds * 1000), form: "delta-seconds" };
  }

  // `Date.parse` is far more permissive than HTTP's IMF-fixdate format (it
  // will happily "parse" short garbage strings like "-5"), so only hand it
  // something that already looks like an HTTP-date.
  if (IMF_FIXDATE.test(trimmed)) {
    const dateMs = Date.parse(trimmed);
    if (!Number.isNaN(dateMs)) {
      return { delayMs: Math.max(0, dateMs - now()), form: "http-date" };
    }
  }

  return UNPARSEABLE;
}

/** Convenience wrapper: reads and parses `Retry-After` straight off a `Response`. */
export function retryAfterFromResponse(response: Response, now: () => number = Date.now): RetryAfterResult {
  return parseRetryAfter(response.headers.get("Retry-After"), now);
}
