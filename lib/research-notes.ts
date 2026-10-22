import type { DashboardNetworkId } from "@/lib/network";
import { normalizeWatchlistAddress, resolveWatchlistKind } from "@/lib/watchlist";

export const RESEARCH_NOTES_STORAGE_KEY = "lumenmap:research-notes:v1";
export const RESEARCH_NOTES_CHANGED_EVENT = "lumenmap:research-notes-changed";
export const RESEARCH_NOTE_LIMIT = 500;

export type ResearchNote = {
  address: string;
  network: DashboardNetworkId;
  text: string;
  updatedAt: string;
};

export type ResearchNotesStorage = Pick<Storage, "getItem" | "setItem">;

function isResearchNote(value: unknown): value is ResearchNote {
  if (!value || typeof value !== "object") return false;
  const note = value as ResearchNote;
  return (
    typeof note.address === "string" &&
    resolveWatchlistKind(note.address) !== null &&
    note.address === normalizeWatchlistAddress(note.address) &&
    (note.network === "mainnet" || note.network === "testnet") &&
    typeof note.text === "string" &&
    note.text.trim().length > 0 &&
    note.text.length <= RESEARCH_NOTE_LIMIT &&
    typeof note.updatedAt === "string"
  );
}

export function readResearchNotesFromStorage(
  storage: ResearchNotesStorage | null = typeof window !== "undefined" ? window.localStorage : null,
): ResearchNote[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RESEARCH_NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const file = parsed as { version?: unknown; notes?: unknown };
    if (file.version !== 1 || !Array.isArray(file.notes)) return [];
    const seen = new Set<string>();
    return file.notes.filter((note): note is ResearchNote => {
      if (!isResearchNote(note)) return false;
      const key = `${note.network}:${note.address}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch {
    return [];
  }
}

export function writeResearchNotesToStorage(
  notes: ResearchNote[],
  storage: ResearchNotesStorage | null = typeof window !== "undefined" ? window.localStorage : null,
): void {
  if (!storage) return;
  storage.setItem(RESEARCH_NOTES_STORAGE_KEY, exportResearchNotesJson(notes));
  if (typeof window !== "undefined" && storage === window.localStorage) {
    window.dispatchEvent(new Event(RESEARCH_NOTES_CHANGED_EVENT));
  }
}

export function findResearchNote(
  notes: ResearchNote[],
  address: string,
  network: DashboardNetworkId,
): ResearchNote | undefined {
  const normalized = normalizeWatchlistAddress(address);
  return notes.find((note) => note.address === normalized && note.network === network);
}

export function updateResearchNote(input: {
  notes: ResearchNote[];
  address: string;
  network: DashboardNetworkId;
  text: string;
  now?: string;
}): { ok: true; notes: ResearchNote[] } | { ok: false; error: string } {
  const address = normalizeWatchlistAddress(input.address);
  if (!resolveWatchlistKind(address)) {
    return { ok: false, error: "Enter a valid Stellar account or contract address." };
  }
  if (input.text.length > RESEARCH_NOTE_LIMIT) {
    return { ok: false, error: `Note must be ${RESEARCH_NOTE_LIMIT} characters or fewer.` };
  }
  const notes = input.notes.filter((note) => note.address !== address || note.network !== input.network);
  if (!input.text.trim()) return { ok: true, notes };
  return {
    ok: true,
    notes: [...notes, { address, network: input.network, text: input.text, updatedAt: input.now ?? new Date().toISOString() }],
  };
}

export function exportResearchNotesJson(notes: ResearchNote[]): string {
  return JSON.stringify({ version: 1, notes }, null, 2);
}
