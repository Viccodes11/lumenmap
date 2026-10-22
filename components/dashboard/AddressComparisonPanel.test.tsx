import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, getByLabelText, getByRole, queryByRole, queryAllByRole } from "@testing-library/dom";
import { AddressComparisonPanel } from "./AddressComparisonPanel";
import { createSearchFixtures } from "@/lib/search/fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const data = createSearchFixtures();
const KRAKEN = "GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKTM";
const SOROSWAP_CONTRACT = "CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2";

const state = vi.hoisted(() => ({
  data: null as unknown,
  flowViewEnabled: false,
}));

vi.mock("@/components/dashboard/DashboardProvider", () => ({
  useDashboard: () => state,
}));

let container: HTMLDivElement;
let root: Root;

function render() {
  act(() => {
    root.render(<AddressComparisonPanel />);
  });
}

function compare(a: string, b: string) {
  fireEvent.change(getByLabelText(container, "Address A"), { target: { value: a } });
  fireEvent.change(getByLabelText(container, "Address B"), { target: { value: b } });
  act(() => {
    fireEvent.click(getByRole(container, "button", { name: "Compare" }));
  });
}

beforeEach(() => {
  state.data = data;
  state.flowViewEnabled = false;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(container);
});

describe("AddressComparisonPanel", () => {
  it("rejects an invalid address with a visible error", () => {
    render();
    compare("not-an-address", KRAKEN);
    const alert = getByRole(container, "alert");
    expect(alert.textContent).toContain("Address A");
    expect(queryByRole(container, "table")).toBeNull();
  });

  it("rejects comparing an address against itself", () => {
    render();
    compare(KRAKEN, KRAKEN);
    expect(getByRole(container, "alert").textContent).toMatch(/different addresses/i);
  });

  it("resolves two known addresses and shows their own type/category/op count", () => {
    render();
    compare(KRAKEN, SOROSWAP_CONTRACT);
    const table = getByRole(container, "table");
    expect(table.textContent).toContain("Kraken");
    expect(table.textContent).toContain("exchange");
  });

  it("omits counterparty rows when Flow is disabled (table-only fallback)", () => {
    state.flowViewEnabled = false;
    render();
    compare(KRAKEN, SOROSWAP_CONTRACT);
    expect(container.textContent).not.toContain("Counterparty overlap");
  });

  it("includes a counterparty overlap row when Flow is enabled", () => {
    state.flowViewEnabled = true;
    render();
    compare(KRAKEN, SOROSWAP_CONTRACT);
    expect(container.textContent).toContain("Counterparty overlap");
  });

  it("writes the compare addresses to the URL on a successful comparison", () => {
    render();
    compare(KRAKEN, SOROSWAP_CONTRACT);
    const params = new URL(window.location.href).searchParams;
    expect(params.get("compare")).toBe(`${KRAKEN},${SOROSWAP_CONTRACT}`);
  });

  it("does not update the URL when validation fails", () => {
    render();
    compare("not-an-address", KRAKEN);
    const params = new URL(window.location.href).searchParams;
    expect(params.get("compare")).toBeNull();
  });

  it("auto-runs a comparison from a compare= URL param on mount", () => {
    window.history.replaceState(null, "", `/?compare=${KRAKEN},${SOROSWAP_CONTRACT}`);
    render();
    expect(queryAllByRole(container, "table").length).toBe(1);
    expect(container.textContent).toContain("Kraken");
  });
});
