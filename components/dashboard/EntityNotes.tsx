"use client";

import { useEffect, useState } from "react";
import type { DashboardNetworkId } from "@/lib/network";
import {
  NOTES_UPDATED_EVENT,
  NOTE_MAX_LENGTH,
  findNote,
  readNotesFromStorage,
  setNote,
  writeNotesToStorage,
} from "@/lib/notes";
import { Button } from "@/components/ui/button";

/**
 * A sticky, local-only research note attached to one address/network
 * pair. Edited inline from the DetailPanel; persisted to localStorage so
 * it survives a reload, with no cloud sync or sharing (out of scope).
 */
export function EntityNotes({ address, network }: { address: string; network: DashboardNetworkId }) {
  const [draft, setDraft] = useState("");
  const [savedText, setSavedText] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const existing = findNote(readNotesFromStorage(), address, network);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedText(existing?.text ?? null);
    setDraft(existing?.text ?? "");
    setEditing(false);
    setError("");
  }, [address, network]);

  const handleSave = () => {
    const notes = readNotesFromStorage();
    const result = setNote(notes, address, network, draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    writeNotesToStorage(result.notes);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event(NOTES_UPDATED_EVENT));
    }
    const saved = findNote(result.notes, address, network);
    setSavedText(saved?.text ?? null);
    setDraft(saved?.text ?? "");
    setEditing(false);
    setError("");
  };

  const handleClear = () => {
    setDraft("");
    const notes = readNotesFromStorage();
    const result = setNote(notes, address, network, "");
    if (result.ok) {
      writeNotesToStorage(result.notes);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(NOTES_UPDATED_EVENT));
      }
    }
    setSavedText(null);
    setEditing(false);
    setError("");
  };

  if (!editing && savedText === null) {
    return (
      <div>
        <p className="mb-1 text-xs text-zinc-500">Research note</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
          Add note
        </Button>
      </div>
    );
  }

  if (!editing && savedText !== null) {
    return (
      <div>
        <p className="mb-1 text-xs text-zinc-500">Research note</p>
        <p
          data-testid="entity-note-text"
          className="whitespace-pre-wrap rounded-lg border border-white/10 bg-black/20 p-3 text-sm text-zinc-200"
        >
          {savedText}
        </p>
        <div className="mt-2 flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleClear}>
            Clear
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-500" htmlFor="entity-note-input">
        Research note
      </label>
      <textarea
        id="entity-note-input"
        data-testid="entity-note-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        rows={3}
        maxLength={NOTE_MAX_LENGTH + 200}
        placeholder="Plain-text notes for this address, kept only in this browser…"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
      />
      <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
        <span>
          {draft.trim().length}/{NOTE_MAX_LENGTH}
        </span>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-sm text-rose-300">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" onClick={handleSave}>
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setDraft(savedText ?? "");
            setEditing(false);
            setError("");
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
