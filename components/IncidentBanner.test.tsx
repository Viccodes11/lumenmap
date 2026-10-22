import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, getByRole, queryByTestId } from "@testing-library/dom";
import { IncidentBanner } from "./IncidentBanner";
import type { IncidentState } from "@/lib/incident-health";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const incidents: IncidentState[] = [
  {
    kind: "credentials-missing",
    title: "Live data credentials are not configured",
    message: "Local fixture data remains available.",
  },
  {
    kind: "degraded",
    title: "Live data is partially degraded",
    message: "Some charts may be incomplete.",
  },
  {
    kind: "down",
    title: "Live data is temporarily unavailable",
    message: "Live charts are unavailable.",
  },
];

describe("IncidentBanner", () => {
  it.each(incidents)("renders the $kind state with status links", (incident) => {
    act(() => root.render(<IncidentBanner incident={incident} />));

    expect(queryByTestId(container, "incident-banner")).not.toBeNull();
    expect(
      getByRole(container, "complementary", { name: "Service incident" })
        .textContent,
    ).toContain(incident.title);
    expect(
      getByRole(container, "link", { name: "View status details" }).getAttribute(
        "href",
      ),
    ).toBe("/api/health?type=readiness");
    expect(
      getByRole(container, "link", { name: "Freshness methodology" }).getAttribute(
        "href",
      ),
    ).toBe("/methodology");
  });

  it("is keyboard dismissible without moving focus", () => {
    act(() => root.render(<IncidentBanner incident={incidents[1]} />));
    const dismiss = getByRole(container, "button", { name: "Dismiss incident notice" });
    dismiss.focus();

    act(() => fireEvent.keyDown(window, { key: "Escape" }));

    expect(queryByTestId(container, "incident-banner")).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});
