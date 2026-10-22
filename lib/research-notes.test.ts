import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIXTURE_ACCOUNTS, FIXTURE_CONTRACTS } from "@/lib/fixtures/raw-data";
import {
  RESEARCH_NOTE_LIMIT,
  RESEARCH_NOTES_STORAGE_KEY,
  exportResearchNotesJson,
  findResearchNote,
  readResearchNotesFromStorage,
  updateResearchNote,
  writeResearchNotesToStorage,
  type ResearchNotesStorage,
} from "./research-notes";

function memoryStorage(): ResearchNotesStorage & { snapshot(): string | null } {
  const values = new Map<string, string>();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    snapshot() { return values.get(RESEARCH_NOTES_STORAGE_KEY) ?? null; },
  };
}

describe("local research notes", () => {
  it("persists by address and network across reads", () => {
    const storage = memoryStorage();
    const first = updateResearchNote({
      notes: [], address: FIXTURE_ACCOUNTS.kraken.toLowerCase(), network: "mainnet",
      text: "Mainnet observation", now: "2026-10-22T00:00:00.000Z",
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const second = updateResearchNote({
      notes: first.notes, address: FIXTURE_ACCOUNTS.kraken, network: "testnet",
      text: "Testnet observation", now: "2026-10-22T00:01:00.000Z",
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    writeResearchNotesToStorage(second.notes, storage);
    const restored = readResearchNotesFromStorage(storage);
    assert.equal(findResearchNote(restored, FIXTURE_ACCOUNTS.kraken, "mainnet")?.text, "Mainnet observation");
    assert.equal(findResearchNote(restored, FIXTURE_ACCOUNTS.kraken, "testnet")?.text, "Testnet observation");
    assert.deepEqual(JSON.parse(exportResearchNotesJson(restored)), JSON.parse(storage.snapshot() ?? ""));
  });

  it("rejects overflow without changing the saved note", () => {
    const initial = updateResearchNote({
      notes: [], address: FIXTURE_CONTRACTS.soroswap, network: "mainnet", text: "Original",
    });
    assert.equal(initial.ok, true);
    if (!initial.ok) return;
    const overflow = updateResearchNote({
      notes: initial.notes, address: FIXTURE_CONTRACTS.soroswap,
      network: "mainnet", text: "x".repeat(RESEARCH_NOTE_LIMIT + 1),
    });
    assert.equal(overflow.ok, false);
    if (!overflow.ok) assert.match(overflow.error, /500 characters/);
    assert.equal(findResearchNote(initial.notes, FIXTURE_CONTRACTS.soroswap, "mainnet")?.text, "Original");
  });

  it("clearing removes the note and an unrelated network stays intact", () => {
    const note = updateResearchNote({ notes: [], address: FIXTURE_ACCOUNTS.kraken, network: "mainnet", text: "Watch" });
    assert.equal(note.ok, true);
    if (!note.ok) return;
    const other = updateResearchNote({ notes: note.notes, address: FIXTURE_ACCOUNTS.kraken, network: "testnet", text: "Separate" });
    assert.equal(other.ok, true);
    if (!other.ok) return;
    const cleared = updateResearchNote({ notes: other.notes, address: FIXTURE_ACCOUNTS.kraken, network: "mainnet", text: "   " });
    assert.equal(cleared.ok, true);
    if (cleared.ok) {
      assert.equal(findResearchNote(cleared.notes, FIXTURE_ACCOUNTS.kraken, "mainnet"), undefined);
      assert.equal(findResearchNote(cleared.notes, FIXTURE_ACCOUNTS.kraken, "testnet")?.text, "Separate");
    }
  });

  it("ignores malformed persisted data", () => {
    const storage = memoryStorage();
    storage.setItem(RESEARCH_NOTES_STORAGE_KEY, "{bad json");
    assert.deepEqual(readResearchNotesFromStorage(storage), []);
    storage.setItem(RESEARCH_NOTES_STORAGE_KEY, JSON.stringify({ version: 1, notes: [{ address: "bad", text: "x", network: "mainnet" }] }));
    assert.deepEqual(readResearchNotesFromStorage(storage), []);
  });
});
