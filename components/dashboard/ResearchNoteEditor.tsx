"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DashboardNetworkId } from "@/lib/network";
import {
  findResearchNote,
  RESEARCH_NOTE_LIMIT,
  updateResearchNote,
  writeResearchNotesToStorage,
} from "@/lib/research-notes";
import { useResearchNotes } from "@/components/dashboard/useResearchNotes";

export function ResearchNoteEditor({ address, network }: { address: string; network: DashboardNetworkId }) {
  const notes = useResearchNotes();
  const saved = findResearchNote(notes, address, network);
  const [draft, setDraft] = useState(saved?.text ?? "");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(saved?.text ?? "");
    setError("");
    setStatus("");
  }, [address, network, saved?.text]);

  const save = (text: string) => {
    const result = updateResearchNote({ notes, address, network, text });
    if (!result.ok) {
      setError(result.error);
      setStatus("");
      return;
    }
    try {
      writeResearchNotesToStorage(result.notes);
      setDraft(text.trim() ? text : "");
      setError("");
      setStatus(text.trim() ? "Note saved in this browser." : "Note cleared.");
    } catch {
      setError("Could not save the note in this browser.");
      setStatus("");
    }
  };

  return (
    <section aria-label="Research note" className="rounded-lg border border-white/10 bg-black/20 p-3">
      <label htmlFor="research-note" className="mb-2 block text-xs font-semibold text-zinc-400">
        Research note · {network}
      </label>
      <textarea
        id="research-note"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError("");
          setStatus("");
        }}
        rows={4}
        placeholder="Add a private note about this address"
        className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        aria-describedby="research-note-count"
      />
      <p id="research-note-count" className="mt-1 text-xs text-zinc-500">
        {draft.length}/{RESEARCH_NOTE_LIMIT} characters · saved locally
      </p>
      {error ? <p role="alert" className="mt-2 text-xs text-rose-300">{error}</p> : null}
      {status ? <p role="status" className="mt-2 text-xs text-emerald-300">{status}</p> : null}
      <div className="mt-2 flex gap-2">
        <Button type="button" size="sm" onClick={() => save(draft)}>Save note</Button>
        {saved ? <Button type="button" size="sm" variant="outline" onClick={() => save("")}>Clear note</Button> : null}
      </div>
    </section>
  );
}
