import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, getByRole, queryByRole } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FIXTURE_ACCOUNTS } from "@/lib/fixtures/raw-data";
import { RESEARCH_NOTES_STORAGE_KEY, readResearchNotesFromStorage } from "@/lib/research-notes";
import { ResearchNoteEditor } from "./ResearchNoteEditor";

let container: HTMLDivElement;
let root: Root;
const stored = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  },
});

beforeEach(() => {
  window.localStorage.removeItem(RESEARCH_NOTES_STORAGE_KEY);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.localStorage.removeItem(RESEARCH_NOTES_STORAGE_KEY);
});

describe("ResearchNoteEditor", () => {
  it("saves, restores, rejects overflow, and clears a local note", () => {
    act(() => root.render(<ResearchNoteEditor address={FIXTURE_ACCOUNTS.kraken} network="mainnet" />));
    const textbox = getByRole(container, "textbox", { name: /research note/i }) as HTMLTextAreaElement;
    act(() => fireEvent.change(textbox, { target: { value: "Known exchange" } }));
    act(() => fireEvent.click(getByRole(container, "button", { name: "Save note" })));
    expect(readResearchNotesFromStorage()[0]?.text).toBe("Known exchange");

    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<ResearchNoteEditor address={FIXTURE_ACCOUNTS.kraken} network="mainnet" />));
    const restored = getByRole(container, "textbox", { name: /research note/i }) as HTMLTextAreaElement;
    expect(restored.value).toBe("Known exchange");

    act(() => fireEvent.change(restored, { target: { value: "x".repeat(501) } }));
    act(() => fireEvent.click(getByRole(container, "button", { name: "Save note" })));
    expect(getByRole(container, "alert").textContent).toMatch(/500 characters/);
    expect(readResearchNotesFromStorage()[0]?.text).toBe("Known exchange");

    act(() => fireEvent.click(getByRole(container, "button", { name: "Clear note" })));
    expect(readResearchNotesFromStorage()).toEqual([]);
    expect(queryByRole(container, "button", { name: "Clear note" })).toBeNull();
  });
});
