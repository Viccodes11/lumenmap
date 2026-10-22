"use client";

import { useEffect, useState } from "react";
import type { IncidentState } from "@/lib/incident-health";

export function IncidentBanner({ incident }: { incident: IncidentState }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (dismissed) return;

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setDismissed(true);
    }

    window.addEventListener("keydown", dismissOnEscape);
    return () => window.removeEventListener("keydown", dismissOnEscape);
  }, [dismissed]);

  if (dismissed) return null;

  const unavailable = incident.kind === "down";

  return (
    <aside
      aria-label="Service incident"
      aria-live="polite"
      data-incident-kind={incident.kind}
      data-testid="incident-banner"
      className={
        unavailable
          ? "border-b border-red-700/70 bg-red-950 px-4 py-3 text-red-50"
          : "border-b border-amber-700/70 bg-amber-950 px-4 py-3 text-amber-50"
      }
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-2 text-sm sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold">{incident.title}</p>
          <p className="mt-1 text-xs opacity-90">{incident.message}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <a className="underline underline-offset-2" href="/api/health?type=readiness">
              View status details
            </a>
            <a className="underline underline-offset-2" href="/methodology">
              Freshness methodology
            </a>
          </div>
        </div>
        <button
          type="button"
          className="min-h-11 self-start rounded border border-current/40 px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          onClick={() => setDismissed(true)}
        >
          Dismiss incident notice
        </button>
      </div>
    </aside>
  );
}
