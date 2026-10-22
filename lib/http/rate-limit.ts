/** Parse an HTTP Retry-After header into a delay in milliseconds. */
export function parseRetryAfter(
  value: string | null,
  nowMs: number = Date.now(),
): number | null {
  if (value === null) return null;
  const header = value.trim();

  if (/^\d+$/.test(header)) {
    const delayMs = Number(header) * 1_000;
    return Number.isSafeInteger(delayMs) ? delayMs : null;
  }

  // HTTP-date permits IMF-fixdate and two obsolete forms that clients may receive.
  const asctimeDate = /^[A-Za-z]{3} [A-Za-z]{3} [ \d]\d \d{2}:\d{2}:\d{2} \d{4}$/;
  const httpDate = /^(?:[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT|[A-Za-z]{6,9}, \d{2}-[A-Za-z]{3}-\d{2} \d{2}:\d{2}:\d{2} GMT)$/;
  if (!httpDate.test(header) && !asctimeDate.test(header)) return null;

  // asctime has no timezone marker, but HTTP-date always represents GMT.
  const retryAtMs = Date.parse(asctimeDate.test(header) ? `${header} GMT` : header);
  if (!Number.isFinite(retryAtMs)) return null;
  return Math.max(0, retryAtMs - nowMs);
}
