import type { ActivityKpis, DashboardMetricId, Period } from "@/lib/types";
import type {
  ResearchSnapshot,
  SnapshotSelectedNode,
  SnapshotViewId,
} from "@/lib/snapshots/types";
import type { TreemapNode } from "@/lib/types";

const PERIODS = new Set<Period>(["1d", "7d", "30d", "month"]);
const METRICS = new Set<DashboardMetricId>([
  "ops",
  "xlm_volume",
  "usdc",
  "transactions",
  "protocol_tvl",
]);
const VIEWS = new Set<SnapshotViewId>([
  "events",
  "actors",
  "actors_dest",
  "flow",
]);

const MAX_NODES = 32;
const MAX_NAME = 200;
const MAX_PATH = 12;

type SnapshotDraft = Omit<ResearchSnapshot, "id" | "generatedAt" | "expiresAt" | "kpiPayloadHash">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isMetricValue(
  value: unknown,
  kind: string,
  unit: string,
): boolean {
  if (!isRecord(value)) return false;
  return (
    value.kind === kind &&
    value.unit === unit &&
    typeof value.value === "number" &&
    Number.isFinite(value.value)
  );
}

function parseKpis(value: unknown): ActivityKpis | null {
  if (!isRecord(value)) return null;
  if (typeof value.topCategory !== "string" || value.topCategory.length > MAX_NAME) {
    return null;
  }
  if (!isMetricValue(value.totalOps, "operations", "ops")) return null;
  if (!isMetricValue(value.sorobanShare, "share", "percent")) return null;
  if (!isMetricValue(value.activeContracts, "entity_count", "count")) return null;
  if (!isMetricValue(value.activeWallets, "entity_count", "count")) return null;
  if (!isMetricValue(value.activeDestinationAccounts, "entity_count", "count")) {
    return null;
  }
  return {
    totalOps: value.totalOps as ActivityKpis["totalOps"],
    sorobanShare: value.sorobanShare as ActivityKpis["sorobanShare"],
    topCategory: value.topCategory,
    activeContracts: value.activeContracts as ActivityKpis["activeContracts"],
    activeWallets: value.activeWallets as ActivityKpis["activeWallets"],
    activeDestinationAccounts:
      value.activeDestinationAccounts as ActivityKpis["activeDestinationAccounts"],
  };
}

function parseNodes(value: unknown): SnapshotSelectedNode[] | null {
  if (!Array.isArray(value) || value.length > MAX_NODES) return null;
  const nodes: SnapshotSelectedNode[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    if (typeof item.name !== "string" || item.name.length === 0 || item.name.length > MAX_NAME) {
      return null;
    }
    const node: SnapshotSelectedNode = { name: item.name };
    if (typeof item.id === "string" && item.id.length > 0 && item.id.length <= MAX_NAME) {
      node.id = item.id;
    }
    if (typeof item.value === "number" && Number.isFinite(item.value)) {
      node.value = item.value;
    }
    if (typeof item.share === "number" && Number.isFinite(item.share)) {
      node.share = item.share;
    }
    if (Array.isArray(item.path)) {
      const path = item.path.filter(
        (segment): segment is string =>
          typeof segment === "string" && segment.length > 0 && segment.length <= MAX_NAME,
      );
      if (path.length > MAX_PATH) return null;
      if (path.length > 0) node.path = path;
    }
    nodes.push(node);
  }
  return nodes;
}

function parseTreemap(value: unknown): TreemapNode | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.name !== "string" || value.name.length === 0) {
    return null;
  }
  return value as unknown as TreemapNode;
}

export function parseSnapshotBody(
  value: unknown,
): { ok: true; draft: SnapshotDraft } | { ok: false; message: string } {
  if (!isRecord(value)) {
    return { ok: false, message: "Snapshot body must be a JSON object." };
  }
  if (!PERIODS.has(value.period as Period)) {
    return { ok: false, message: "Snapshot period is missing or unsupported." };
  }
  if (!METRICS.has(value.metric as DashboardMetricId)) {
    return { ok: false, message: "Snapshot metric is missing or unsupported." };
  }
  if (!VIEWS.has(value.view as SnapshotViewId)) {
    return { ok: false, message: "Snapshot view is missing or unsupported." };
  }
  const selectedNodes = parseNodes(value.selectedNodes);
  if (!selectedNodes) {
    return { ok: false, message: "Snapshot selected nodes are missing or invalid." };
  }
  const kpis = parseKpis(value.kpis);
  if (!kpis) {
    return { ok: false, message: "Snapshot KPI payload is missing or invalid." };
  }
  const treemap = parseTreemap(value.treemap);
  if (treemap === null) {
    return { ok: false, message: "Snapshot treemap must be an object with a name." };
  }

  const draft: SnapshotDraft = {
    period: value.period as Period,
    metric: value.metric as DashboardMetricId,
    view: value.view as SnapshotViewId,
    selectedNodes,
    kpis,
  };
  if (value.source === "hubble" || value.source === "fixture") {
    draft.source = value.source;
  }
  if (value.network === "mainnet" || value.network === "testnet") {
    draft.network = value.network;
  }
  if (treemap) draft.treemap = treemap;
  return { ok: true, draft };
}
