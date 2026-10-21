import { randomBytes } from "node:crypto";
import { snapshotTtlSeconds } from "@/lib/snapshots/constants";
import type { ResearchSnapshot } from "@/lib/snapshots/types";

type SnapshotEntry = {
  snapshot: ResearchSnapshot;
  expiresAtMs: number;
};

const entries = new Map<string, SnapshotEntry>();
let clock = () => Date.now();

/** Test hook. Production uses Date.now. */
export function setSnapshotClock(next: () => number): void {
  clock = next;
}

export function resetSnapshotClock(): void {
  clock = () => Date.now();
}

export function clearSnapshotStore(): void {
  entries.clear();
}

export function createSnapshotId(): string {
  return randomBytes(9).toString("base64url");
}

export function isSnapshotId(id: string): boolean {
  return /^[A-Za-z0-9_-]{8,32}$/.test(id);
}

export function saveSnapshot(
  snapshot: Omit<ResearchSnapshot, "id" | "generatedAt" | "expiresAt">,
): ResearchSnapshot {
  const generatedAtMs = clock();
  const expiresAtMs = generatedAtMs + snapshotTtlSeconds() * 1000;
  const stored: ResearchSnapshot = {
    ...snapshot,
    id: createSnapshotId(),
    generatedAt: new Date(generatedAtMs).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
  entries.set(stored.id, { snapshot: stored, expiresAtMs });
  return stored;
}

/** Returns the frozen payload, or null when the id is missing or expired. */
export function getSnapshot(id: string): ResearchSnapshot | null {
  if (!isSnapshotId(id)) return null;
  const entry = entries.get(id);
  if (!entry) return null;
  if (clock() >= entry.expiresAtMs) {
    entries.delete(id);
    return null;
  }
  return entry.snapshot;
}
