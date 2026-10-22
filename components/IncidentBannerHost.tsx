"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IncidentBanner } from "@/components/IncidentBanner";
import {
  classifyIncident,
  type IncidentState,
  type ReadinessHealth,
} from "@/lib/incident-health";

export const INCIDENT_DEBOUNCE_MS = 2_500;
const HEALTH_POLL_MS = 30_000;

async function fetchReadiness(): Promise<ReadinessHealth> {
  const response = await fetch("/api/health?type=readiness", {
    cache: "no-store",
    headers: { accept: "application/json" },
  });

  if (!response.ok && response.status !== 503) {
    throw new Error("HEALTH_REQUEST_FAILED");
  }

  const body = (await response.json()) as ReadinessHealth;
  if (!(["healthy", "degraded", "unavailable"] as const).includes(body.status)) {
    throw new Error("INVALID_HEALTH_RESPONSE");
  }
  return body;
}

export function IncidentBannerHost({
  debounceMs = INCIDENT_DEBOUNCE_MS,
}: {
  debounceMs?: number;
}) {
  const query = useQuery({
    queryKey: ["readiness-health"],
    queryFn: fetchReadiness,
    refetchInterval: HEALTH_POLL_MS,
    staleTime: 10_000,
    retry: false,
  });
  const candidate = useMemo(
    () => classifyIncident(query.data, query.isError),
    [query.data, query.isError],
  );
  const [visible, setVisible] = useState<IncidentState | null>(null);

  useEffect(() => {
    if (!candidate) return;

    const timer = window.setTimeout(() => setVisible(candidate), debounceMs);
    return () => window.clearTimeout(timer);
  }, [candidate, debounceMs]);

  return candidate && visible?.kind === candidate.kind ? (
    <IncidentBanner key={visible.kind} incident={visible} />
  ) : null;
}
