import type { DashboardNetworkId } from "@/lib/network";

/** localStorage key. Versioned the same way as the watchlist and saved research views. */
export const NOTES_STORAGE_KEY = "lumenmap:entity-notes:v1";

/** Hard cap from the issue. Plain text only — no markdown preview in v1. */
export const NOTE_MAX_LENGTH = 500;

export const NOTE_TOO_LONG = `Note must be ${NOTE_MAX_LENGTH} characters or fewer.`;

/**
 * Dispatched on `window` after a write so other mounted components
 * (e.g. the watchlist's "has a note" indicator) can re-read storage
 * without a full page reload.
 */
export const NOTES_UPDATED_EVENT = "lumenmap:notes-updated";

export type EntityNote = {
  address: string;
  network: DashboardNetworkId;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type NotesFile = {
  version: 1;
  notes: EntityNote[];
};

export type NotesStorage = Pick<Storage, "getItem" | "setItem">;

function nowIso(): string {
  return new Date().toISOString();
}

function defaultStorage(): NotesStorage | null {
  return typeof window !== "undefined" ? window.localStorage : null;
}

/** Notes are keyed by address + network — the same address can mean different entities across networks. */
export function noteKey(address: string, network: DashboardNetworkId): string {
  return `${network}:${address.trim().toUpperCase()}`;
}

function isNote(value: unknown): value is EntityNote {
  if (!value || typeof value !== "object") return false;
  const note = value as EntityNote;
  return (
    typeof note.address === "string" &&
    (note.network === "mainnet" || note.network === "testnet") &&
    typeof note.text === "string" &&
    note.text.length <= NOTE_MAX_LENGTH &&
    typeof note.createdAt === "string" &&
    typeof note.updatedAt === "string"
  );
}

export function readNotesFromStorage(storage: NotesStorage | null = defaultStorage()): EntityNote[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NotesFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.notes)) return [];
    return parsed.notes.filter(isNote);
  } catch {
    return [];
  }
}

export function writeNotesToStorage(notes: EntityNote[], storage: NotesStorage | null = defaultStorage()): void {
  if (!storage) return;
  const payload: NotesFile = { version: 1, notes };
  storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(payload));
}

export function findNote(notes: EntityNote[], address: string, network: DashboardNetworkId): EntityNote | null {
  const key = noteKey(address, network);
  return notes.find((note) => noteKey(note.address, note.network) === key) ?? null;
}

export function hasNote(notes: EntityNote[], address: string, network: DashboardNetworkId): boolean {
  return findNote(notes, address, network) !== null;
}

/**
 * Creates, updates, or clears the note for one address/network pair.
 * Clearing (an empty or whitespace-only `text`) removes the entry
 * entirely, rather than leaving a blank note behind — so `hasNote`
 * correctly reports `false` and any "has a note" indicator disappears.
 */
export function setNote(
  notes: EntityNote[],
  address: string,
  network: DashboardNetworkId,
  text: string,
  now: string = nowIso(),
): { ok: true; notes: EntityNote[] } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (trimmed.length > NOTE_MAX_LENGTH) {
    return { ok: false, error: NOTE_TOO_LONG };
  }

  const key = noteKey(address, network);
  const index = notes.findIndex((note) => noteKey(note.address, note.network) === key);

  if (!trimmed) {
    if (index === -1) return { ok: true, notes };
    const next = notes.slice();
    next.splice(index, 1);
    return { ok: true, notes: next };
  }

  if (index === -1) {
    const created: EntityNote = { address: address.trim().toUpperCase(), network, text: trimmed, createdAt: now, updatedAt: now };
    return { ok: true, notes: [...notes, created] };
  }

  const next = notes.slice();
  next[index] = { ...next[index], text: trimmed, updatedAt: now };
  return { ok: true, notes: next };
}

export function exportNotesJson(notes: EntityNote[]): string {
  const payload: NotesFile = { version: 1, notes };
  return JSON.stringify(payload, null, 2);
}
