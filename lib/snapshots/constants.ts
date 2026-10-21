/**
 * Research snapshots are process-local and file-free.
 * They never call Hubble. Restarting the server drops them.
 *
 * Defaults:
 * - SNAPSHOT_TTL_SECONDS: 604800 (7 days). Expired ids behave as missing.
 * - SNAPSHOT_MAX_BYTES: 65536. Larger POST bodies return 413.
 */

export const DEFAULT_SNAPSHOT_TTL_SECONDS = 7 * 24 * 60 * 60;
export const DEFAULT_SNAPSHOT_MAX_BYTES = 64 * 1024;

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function snapshotTtlSeconds(): number {
  return positiveInt(
    process.env.SNAPSHOT_TTL_SECONDS,
    DEFAULT_SNAPSHOT_TTL_SECONDS,
  );
}

export function snapshotMaxBytes(): number {
  return positiveInt(
    process.env.SNAPSHOT_MAX_BYTES,
    DEFAULT_SNAPSHOT_MAX_BYTES,
  );
}
