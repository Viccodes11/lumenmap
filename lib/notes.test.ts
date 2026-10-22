import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NOTES_STORAGE_KEY,
  NOTE_MAX_LENGTH,
  NOTE_TOO_LONG,
  exportNotesJson,
  findNote,
  hasNote,
  readNotesFromStorage,
  setNote,
  writeNotesToStorage,
  type EntityNote,
  type NotesStorage,
} from "./notes";

function memoryStorage(): NotesStorage & { snapshot(): string | null } {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    snapshot() {
      return values.get(NOTES_STORAGE_KEY) ?? null;
    },
  };
}

const ADDRESS = "GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKTM";

describe("setNote", () => {
  it("creates a note for a new address/network pair", () => {
    const result = setNote([], ADDRESS, "mainnet", "Flagged by compliance on 2026-01-01.", "2026-01-01T00:00:00.000Z");
    assert.ok(result.ok);
    assert.equal(result.notes.length, 1);
    assert.equal(result.notes[0].text, "Flagged by compliance on 2026-01-01.");
    assert.equal(result.notes[0].createdAt, "2026-01-01T00:00:00.000Z");
  });

  it("trims whitespace before storing", () => {
    const result = setNote([], ADDRESS, "mainnet", "  spaced note  ");
    assert.ok(result.ok);
    assert.equal(result.notes[0].text, "spaced note");
  });

  it("updates an existing note's text and updatedAt without changing createdAt", () => {
    const first = setNote([], ADDRESS, "mainnet", "first", "2026-01-01T00:00:00.000Z");
    assert.ok(first.ok);
    const second = setNote(first.notes, ADDRESS, "mainnet", "second", "2026-01-02T00:00:00.000Z");
    assert.ok(second.ok);
    assert.equal(second.notes.length, 1);
    assert.equal(second.notes[0].text, "second");
    assert.equal(second.notes[0].createdAt, "2026-01-01T00:00:00.000Z");
    assert.equal(second.notes[0].updatedAt, "2026-01-02T00:00:00.000Z");
  });

  it("rejects a note over the character limit with a clear error", () => {
    const tooLong = "x".repeat(NOTE_MAX_LENGTH + 1);
    const result = setNote([], ADDRESS, "mainnet", tooLong);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, NOTE_TOO_LONG);
  });

  it("accepts a note at exactly the character limit", () => {
    const exact = "x".repeat(NOTE_MAX_LENGTH);
    const result = setNote([], ADDRESS, "mainnet", exact);
    assert.ok(result.ok);
    assert.equal(result.notes[0].text.length, NOTE_MAX_LENGTH);
  });

  it("clearing a note (empty text) removes it entirely", () => {
    const withNote = setNote([], ADDRESS, "mainnet", "something");
    assert.ok(withNote.ok);
    const cleared = setNote(withNote.notes, ADDRESS, "mainnet", "");
    assert.ok(cleared.ok);
    assert.equal(cleared.notes.length, 0);
    assert.equal(hasNote(cleared.notes, ADDRESS, "mainnet"), false);
  });

  it("clearing a whitespace-only text also removes the note", () => {
    const withNote = setNote([], ADDRESS, "mainnet", "something");
    assert.ok(withNote.ok);
    const cleared = setNote(withNote.notes, ADDRESS, "mainnet", "   ");
    assert.ok(cleared.ok);
    assert.equal(cleared.notes.length, 0);
  });

  it("clearing an address with no existing note is a no-op", () => {
    const result = setNote([], ADDRESS, "mainnet", "");
    assert.ok(result.ok);
    assert.equal(result.notes.length, 0);
  });

  it("keeps the same address separate across networks", () => {
    const mainnetNote = setNote([], ADDRESS, "mainnet", "mainnet note");
    assert.ok(mainnetNote.ok);
    const both = setNote(mainnetNote.notes, ADDRESS, "testnet", "testnet note");
    assert.ok(both.ok);
    assert.equal(both.notes.length, 2);
    assert.equal(findNote(both.notes, ADDRESS, "mainnet")?.text, "mainnet note");
    assert.equal(findNote(both.notes, ADDRESS, "testnet")?.text, "testnet note");
  });

  it("is case-insensitive on the address for lookups", () => {
    const result = setNote([], ADDRESS, "mainnet", "note");
    assert.ok(result.ok);
    assert.ok(findNote(result.notes, ADDRESS.toLowerCase(), "mainnet"));
  });
});

describe("hasNote", () => {
  it("reports false when no note exists for the pair", () => {
    assert.equal(hasNote([], ADDRESS, "mainnet"), false);
  });

  it("reports true once a note exists, and false again once cleared", () => {
    const withNote = setNote([], ADDRESS, "mainnet", "note");
    assert.ok(withNote.ok);
    assert.equal(hasNote(withNote.notes, ADDRESS, "mainnet"), true);
    const cleared = setNote(withNote.notes, ADDRESS, "mainnet", "");
    assert.ok(cleared.ok);
    assert.equal(hasNote(cleared.notes, ADDRESS, "mainnet"), false);
  });
});

describe("storage round-trip", () => {
  it("survives a write/read round-trip (the 'survives reload' contract)", () => {
    const storage = memoryStorage();
    const created = setNote([], ADDRESS, "mainnet", "persisted note");
    assert.ok(created.ok);
    writeNotesToStorage(created.notes, storage);

    const reloaded = readNotesFromStorage(storage);
    assert.equal(reloaded.length, 1);
    assert.equal(reloaded[0].text, "persisted note");
  });

  it("returns an empty array when nothing is stored", () => {
    assert.deepEqual(readNotesFromStorage(memoryStorage()), []);
  });

  it("fails closed (empty array) on corrupted JSON rather than throwing", () => {
    const storage = memoryStorage();
    storage.setItem(NOTES_STORAGE_KEY, "{not json");
    assert.deepEqual(readNotesFromStorage(storage), []);
  });

  it("fails closed on an unexpected version or shape", () => {
    const storage = memoryStorage();
    storage.setItem(NOTES_STORAGE_KEY, JSON.stringify({ version: 2, notes: [] }));
    assert.deepEqual(readNotesFromStorage(storage), []);
  });

  it("drops malformed entries (e.g. an over-limit note written by a future version) instead of throwing", () => {
    const storage = memoryStorage();
    const malformed: EntityNote = {
      address: ADDRESS,
      network: "mainnet",
      text: "x".repeat(NOTE_MAX_LENGTH + 100),
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    storage.setItem(NOTES_STORAGE_KEY, JSON.stringify({ version: 1, notes: [malformed] }));
    assert.deepEqual(readNotesFromStorage(storage), []);
  });

  it("returns null from getItem gracefully when storage is unavailable", () => {
    assert.deepEqual(readNotesFromStorage(null), []);
  });
});

describe("exportNotesJson", () => {
  it("produces a versioned payload parseable back into the same notes", () => {
    const created = setNote([], ADDRESS, "mainnet", "note to export");
    assert.ok(created.ok);
    const json = exportNotesJson(created.notes);
    const parsed = JSON.parse(json);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.notes.length, 1);
    assert.equal(parsed.notes[0].text, "note to export");
  });

  it("exports an empty notes list as a valid, empty payload", () => {
    const json = exportNotesJson([]);
    assert.deepEqual(JSON.parse(json), { version: 1, notes: [] });
  });
});
