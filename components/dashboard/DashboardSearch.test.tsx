import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, getByTestId, queryByRole, getAllByRole } from "@testing-library/dom";
import { DashboardSearch, SEARCH_DEBOUNCE_MS } from "./DashboardSearch";
import { createSearchFixtures } from "@/lib/search/fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom doesn't implement scrollIntoView; DashboardSearch calls it to keep
// the active option visible while navigating with the keyboard.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

const data = createSearchFixtures();

const state = vi.hoisted(() => ({
  data: null as unknown,
  isLoading: false,
  searchQuery: "",
  setSearchQuery: vi.fn(),
  selectSearchResult: vi.fn(),
}));

vi.mock("@/components/dashboard/DashboardProvider", () => ({
  useDashboard: () => state,
}));

state.setSearchQuery.mockImplementation((query: string) => {
  state.searchQuery = query;
});

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => {
    root.render(<DashboardSearch />);
  });
}

function typeQuery(value: string) {
  const input = getByTestId(container, "dashboard-search-input");
  act(() => {
    fireEvent.change(input, { target: { value } });
  });
  // The mock's setSearchQuery mutates an external object rather than
  // triggering a real context update (unlike the real DashboardProvider,
  // which always re-renders on setState), so force a re-render to pick up
  // the new value even on a keystroke where the component's own local
  // bookkeeping state (open/activeIndex) happens not to change.
  act(() => {
    root.render(<DashboardSearch />);
  });
}

/** Types a query and advances past the debounce window, for tests that aren't themselves testing debounce timing. */
function typeQueryAndSettle(value: string) {
  typeQuery(value);
  act(() => {
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
  });
}

beforeEach(() => {
  state.data = data;
  state.isLoading = false;
  state.searchQuery = "";
  state.setSearchQuery.mockClear();
  state.selectSearchResult.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(container);
  vi.useRealTimers();
});

describe("DashboardSearch — debounce", () => {
  it("does not re-run the search until the debounce window has elapsed", () => {
    render();
    typeQuery("Kraken");

    // Immediately after typing, the debounce hasn't fired yet, so no
    // results are shown as "found" — the panel may be open, but the
    // listbox should not yet contain the Kraken option.
    expect(container.textContent).not.toContain("Kraken");

    act(() => {
      vi.advanceTimersByTime(149);
    });
    expect(container.textContent).not.toContain("Kraken");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.textContent).toContain("Kraken");
  });

  it("cancels a pending debounce when the query changes again before it fires", () => {
    render();
    // "Kra" would (eventually) surface Kraken; "Soro" is an unrelated
    // token (Soroswap) with no overlap, so the two result sets can't be
    // confused with each other.
    typeQuery("Kra");
    act(() => {
      vi.advanceTimersByTime(100);
    });
    typeQuery("Soro");
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // Only 200ms has elapsed since the first keystroke, but the debounce
    // timer it scheduled should have been cancelled when the query changed
    // again at the 100ms mark — if it had fired anyway, "Kraken" would
    // already be showing here.
    expect(container.textContent).not.toContain("Kraken");
    expect(container.textContent).not.toContain("Soroswap");

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(container.textContent).toContain("Soroswap");
    expect(container.textContent).not.toContain("Kraken");
  });
});

describe("DashboardSearch — typo-tolerant results and highlighting", () => {
  it("surfaces a typo'd query and highlights the matched word in the label", () => {
    render();
    typeQueryAndSettle("Krakken");

    const options = getAllByRole(container, "option", { name: /Kraken/ });
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      const mark = option.querySelector("mark");
      expect(mark?.textContent?.toLowerCase()).toBe("kraken");
    }
  });
});

describe("DashboardSearch — keyboard navigation", () => {
  it("moves the active option with ArrowDown/ArrowUp and selects it on Enter", () => {
    render();
    typeQueryAndSettle("pool");

    const input = getByTestId(container, "dashboard-search-input");
    const options = getAllByRole(container, "option");
    expect(options.length).toBeGreaterThan(1);

    act(() => {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    });
    expect(options[1].getAttribute("aria-selected")).toBe("true");

    act(() => {
      fireEvent.keyDown(input, { key: "ArrowUp" });
    });
    expect(options[0].getAttribute("aria-selected")).toBe("true");

    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(state.selectSearchResult).toHaveBeenCalledTimes(1);
  });

  it("closes the panel on Escape without selecting anything", () => {
    render();
    typeQueryAndSettle("pool");
    const input = getByTestId(container, "dashboard-search-input");

    act(() => {
      fireEvent.keyDown(input, { key: "Escape" });
    });
    expect(queryByRole(container, "listbox")).toBeNull();
    expect(state.selectSearchResult).not.toHaveBeenCalled();
  });
});
