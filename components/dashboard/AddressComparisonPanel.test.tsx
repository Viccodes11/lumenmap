import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, getByRole, findByText } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_ACCOUNTS } from "@/lib/fixtures/raw-data";
import { AddressComparisonPanel } from "./AddressComparisonPanel";

vi.mock("@/components/dashboard/DashboardProvider", () => ({
  useDashboard: () => ({ period: "1d", network: "mainnet", flowViewEnabled: false, setComparePeriod: vi.fn() }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  act(() => root.render(<QueryClientProvider client={client}><AddressComparisonPanel /></QueryClientProvider>));
}

describe("AddressComparisonPanel", () => {
  it("shows invalid address errors without requesting data", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();
    act(() => fireEvent.click(getByRole(container, "button", { name: "Compare addresses" })));
    expect(getByRole(container, "alert").textContent).toMatch(/two valid Stellar/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("loads a deep link and displays split tables with Flow disabled", async () => {
    window.history.replaceState(null, "", `/?compare=${FIXTURE_ACCOUNTS.kraken},${FIXTURE_ACCOUNTS.unknownA}`);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        a: { address: FIXTURE_ACCOUNTS.kraken, opCount: 9, categories: [{ name: "payment", opCount: 9 }], counterparties: [{ address: FIXTURE_ACCOUNTS.lobstr, label: "Lobstr", opCount: 5 }], counterpartiesSampled: false },
        b: { address: FIXTURE_ACCOUNTS.unknownA, opCount: 3, categories: [{ name: "payment", opCount: 3 }], counterparties: [{ address: FIXTURE_ACCOUNTS.lobstr, label: "Lobstr", opCount: 1 }], counterpartiesSampled: false },
      }),
    }));
    renderPanel();
    await act(async () => { await Promise.resolve(); });
    await findByText(container, "Shared payment counterparties: 1");
    expect(container.textContent).toContain("9 operations");
    expect(container.textContent).toContain("3 operations");
    expect(container.textContent).toContain("Lobstr");
  });
});
