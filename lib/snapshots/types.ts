import type {
  ActivityKpis,
  DashboardMetricId,
  DataSource,
  Period,
  TreemapNode,
} from "@/lib/types";

export type SnapshotViewId = "events" | "actors" | "actors_dest" | "flow";

/** A treemap node frozen with the snapshot. Paths are ancestor names only. */
export type SnapshotSelectedNode = {
  id?: string;
  name: string;
  value?: number;
  share?: number;
  path?: string[];
};

/**
 * Immutable research snapshot. KPI numbers are stored beside their hash so a
 * later open does not re-query Hubble for those fields.
 */
export type ResearchSnapshot = {
  id: string;
  generatedAt: string;
  expiresAt: string;
  period: Period;
  metric: DashboardMetricId;
  view: SnapshotViewId;
  selectedNodes: SnapshotSelectedNode[];
  kpiPayloadHash: string;
  kpis: ActivityKpis;
  source?: DataSource;
  network?: "mainnet" | "testnet";
  treemap?: TreemapNode;
};
