import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { queryByTestId } from "@testing-library/dom";
import { vi } from "vitest";
import { IncidentBannerHost } from "./IncidentBannerHost";
import type { ReadinessHealth } from "@/lib/incident-health";

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

const degraded: ReadinessHealth = {
  status: "degraded",
  checks: {
    bigquery: { status: "degraded", message: "BigQuery ping timed out" },
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
});

afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
  container.remove();
  vi.useRealTimers();
});

function renderHost() {
  act(() => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <IncidentBannerHost debounceMs={1_000} />
      </QueryClientProvider>,
    );
  });
}

describe("IncidentBannerHost", () => {
  it("shows a persistent incident only after the debounce window", () => {
    queryClient.setQueryData(["readiness-health"], degraded);
    renderHost();

    act(() => vi.advanceTimersByTime(999));
    expect(queryByTestId(container, "incident-banner")).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(queryByTestId(container, "incident-banner")).not.toBeNull();
  });

  it("does not flicker when health recovers before the debounce window", () => {
    queryClient.setQueryData(["readiness-health"], degraded);
    renderHost();

    act(() => vi.advanceTimersByTime(500));
    act(() => {
      queryClient.setQueryData(["readiness-health"], {
        status: "healthy",
        checks: {},
      } satisfies ReadinessHealth);
    });
    act(() => vi.advanceTimersByTime(1_000));

    expect(queryByTestId(container, "incident-banner")).toBeNull();
  });
});
