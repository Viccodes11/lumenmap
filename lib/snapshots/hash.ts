import { createHash } from "node:crypto";
import type { ActivityKpis } from "@/lib/types";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

/** SHA-256 of the canonical KPI JSON. The stored snapshot keeps this hash. */
export function hashKpiPayload(kpis: ActivityKpis): string {
  return createHash("sha256").update(stableStringify(kpis)).digest("hex");
}
