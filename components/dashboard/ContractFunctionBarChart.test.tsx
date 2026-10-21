import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAllByRole, getByRole, queryByRole } from "@testing-library/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractFunctionBarChart } from "./ContractFunctionBarChart";
import type { ContractFunctionBreakdownRow } from "@/lib/entities/contract-function-breakdown";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await act(async () => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
});

function row(overrides: Partial<ContractFunctionBreakdownRow>): ContractFunctionBreakdownRow {
  return {
    functionName: "transfer",
    eventType: "transfer",
    opCount: 100,
    sharePercent: 50,
    drillPath: [],
    ...overrides,
  };
}

function render(props: Parameters<typeof ContractFunctionBarChart>[0]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ContractFunctionBarChart {...props} />);
  });
  roots.push(root);
  return container;
}

describe("ContractFunctionBarChart", () => {
  it("renders nothing (soft-fail) for an empty row list", () => {
    const container = render({
      rows: [],
      configuredLimit: 15,
      opsUnitLabel: "ops",
      onOpenDrill: vi.fn(),
    });
    expect(container.textContent).toBe("");
    expect(queryByRole(container, "list")).toBeNull();
  });

  it("renders a fixture contract with multiple functions as an accessible list", () => {
    const rows = [
      row({ functionName: "transfer", eventType: "transfer", opCount: 400, sharePercent: 80 }),
      row({ functionName: "swap", eventType: "swap", opCount: 80, sharePercent: 16 }),
      row({ functionName: "approve", eventType: "approve", opCount: 20, sharePercent: 4 }),
    ];
    const container = render({
      rows,
      configuredLimit: 15,
      opsUnitLabel: "ops",
      onOpenDrill: vi.fn(),
    });

    const list = getByRole(container, "list");
    const items = getAllByRole(list, "listitem");
    expect(items).toHaveLength(3);

    const buttons = getAllByRole(container, "button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute("aria-label")).toMatch(/transfer: 400 ops, 80(\.0)?% of this contract's total/);
  });

  it("scales the strongest function's bar to the full track width, others proportionally", () => {
    const rows = [
      row({ functionName: "transfer", eventType: "transfer", opCount: 400, sharePercent: 80 }),
      row({ functionName: "swap", eventType: "swap", opCount: 80, sharePercent: 16 }),
    ];
    const container = render({
      rows,
      configuredLimit: 15,
      opsUnitLabel: "ops",
      onOpenDrill: vi.fn(),
    });

    const bars = container.querySelectorAll<HTMLDivElement>('[aria-hidden="true"] > div');
    expect(bars).toHaveLength(2);
    expect(bars[0].style.width).toBe("100%");
    expect(bars[1].style.width).toBe("20%"); // 16/80 * 100
  });

  it("calls onOpenDrill with the activated row when a bar is clicked", () => {
    const onOpenDrill = vi.fn();
    const rows = [row({ functionName: "transfer", eventType: "transfer" })];
    const container = render({
      rows,
      configuredLimit: 15,
      opsUnitLabel: "ops",
      onOpenDrill,
    });

    const button = getByRole(container, "button");
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onOpenDrill).toHaveBeenCalledTimes(1);
    expect(onOpenDrill).toHaveBeenCalledWith(rows[0]);
  });

  it("shows the configured limit in the caption so the cap is visible, not implied", () => {
    const container = render({
      rows: [row({})],
      configuredLimit: 15,
      opsUnitLabel: "ops",
      onOpenDrill: vi.fn(),
    });
    expect(container.textContent).toContain("Top 15 Soroban host functions");
  });
});
