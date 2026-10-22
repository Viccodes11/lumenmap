"use client";

import { useSyncExternalStore } from "react";
import {
  RESEARCH_NOTES_CHANGED_EVENT,
  RESEARCH_NOTES_STORAGE_KEY,
  readResearchNotesFromStorage,
  type ResearchNote,
} from "@/lib/research-notes";

const EMPTY_NOTES: ResearchNote[] = [];
let cachedRaw: string | null = null;
let cachedNotes: ResearchNote[] = EMPTY_NOTES;

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(RESEARCH_NOTES_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(RESEARCH_NOTES_CHANGED_EVENT, onChange);
  };
}

function getSnapshot(): ResearchNote[] {
  try {
    const raw = window.localStorage.getItem(RESEARCH_NOTES_STORAGE_KEY);
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cachedNotes = readResearchNotesFromStorage();
    }
    return cachedNotes;
  } catch {
    return EMPTY_NOTES;
  }
}

export function useResearchNotes(): ResearchNote[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_NOTES);
}
