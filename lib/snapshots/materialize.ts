import { buildActivityMetricProvenance } from "@/lib/metrics/provenance";
import {
  OPERATION_COUNT_UNIT,
  TRANSACTION_COUNT_UNIT,
  USD_ASSET_UNIT,
  XLM_ASSET_UNIT,
  type ActivityTreemaps,
  type ActivityVisualizationResponse,
  type SelectedNode,
  type TreemapNode,
} from "@/lib/types";
import type { ResearchSnapshot } from "@/lib/snapshots/types";

export type MaterializedSnapshot = {
  data: ActivityVisualizationResponse;
  path: TreemapNode[];
  selected: SelectedNode | null;
};

function blankTreemaps(): ActivityTreemaps {
  const operations = () => ({
    name: "Snapshot",
    metric: "operation_count" as const,
    unit: OPERATION_COUNT_UNIT,
    value: 0,
    children: [] as TreemapNode[],
  });
  const transactions = () => ({
    name: "Snapshot",
    metric: "transaction_count" as const,
    unit: TRANSACTION_COUNT_UNIT,
    value: 0,
    children: [] as TreemapNode[],
  });
  const xlm = () => ({
    name: "Snapshot",
    metric: "asset_volume" as const,
    unit: XLM_ASSET_UNIT,
    value: "0",
    children: [] as TreemapNode[],
  });
  const usdc = () => ({
    name: "Snapshot",
    metric: "asset_volume" as const,
    unit: USD_ASSET_UNIT,
    value: "0",
    children: [] as TreemapNode[],
  });
  const tvl = () => ({
    name: "Snapshot",
    metric: "tvl" as const,
    unit: XLM_ASSET_UNIT,
    value: "0",
    children: [] as TreemapNode[],
  });

  return {
    events: operations(),
    actors: operations(),
    actors_dest: operations(),
    txn_events: transactions(),
    txn_actors: transactions(),
    txn_actors_dest: transactions(),
    xlm_events: xlm(),
    xlm_actors: xlm(),
    xlm_actors_dest: xlm(),
    usdc_events: usdc(),
    usdc_actors: usdc(),
    usdc_actors_dest: usdc(),
    protocol_tvl: tvl(),
  } as unknown as ActivityTreemaps;
}

export function treemapSlot(
  snapshot: Pick<ResearchSnapshot, "metric" | "view">,
): keyof ActivityTreemaps | null {
  if (snapshot.view === "flow") return null;
  if (snapshot.metric === "protocol_tvl") return "protocol_tvl";
  if (snapshot.metric === "transactions") {
    if (snapshot.view === "actors") return "txn_actors";
    if (snapshot.view === "actors_dest") return "txn_actors_dest";
    return "txn_events";
  }
  if (snapshot.metric === "xlm_volume") {
    if (snapshot.view === "actors") return "xlm_actors";
    if (snapshot.view === "actors_dest") return "xlm_actors_dest";
    return "xlm_events";
  }
  if (snapshot.metric === "usdc") {
    if (snapshot.view === "actors") return "usdc_actors";
    if (snapshot.view === "actors_dest") return "usdc_actors_dest";
    return "usdc_events";
  }
  return snapshot.view;
}

function selectionTree(snapshot: ResearchSnapshot): TreemapNode {
  const root: TreemapNode = {
    name: "Frozen selection",
    meta: { type: "root" },
    children: [],
  };

  for (const node of snapshot.selectedNodes) {
    const segments = [...(node.path ?? []), node.name];
    let cursor = root;
    segments.forEach((name, index) => {
      const leaf = index === segments.length - 1;
      let child = cursor.children?.find((item) => item.name === name);
      if (!child) {
        child = {
          name,
          id: leaf ? node.id : undefined,
          value: leaf ? node.value ?? 0 : 0,
          meta: {
            type: leaf ? "entity" : "category",
            id: leaf ? node.id : undefined,
            share: leaf ? node.share : undefined,
            opCount: leaf ? node.value : undefined,
          },
          children: [],
        };
        cursor.children = [...(cursor.children ?? []), child];
      }
      cursor = child;
    });
  }

  return snapshot.treemap?.name ? snapshot.treemap : root;
}

function walkPath(root: TreemapNode<number | string>, names: string[]): TreemapNode[] {
  const path: TreemapNode[] = [];
  let current = root;
  for (const name of names) {
    const child = current.children?.find(
      (node) => node.name === name || node.id === name,
    );
    if (!child) break;
    path.push(child as TreemapNode);
    current = child;
  }
  return path;
}

function toSelected(snapshot: ResearchSnapshot): SelectedNode | null {
  const node = snapshot.selectedNodes[0];
  if (!node) return null;
  return {
    name: node.name,
    value: node.value ?? 0,
    share: node.share ?? 0,
    meta: {
      type: "entity",
      id: node.id,
      share: node.share,
      opCount: node.value,
    },
  };
}

/**
 * Builds dashboard data from the frozen snapshot only.
 * Callers must not refetch activity for these fields.
 */
export function materializeSnapshot(
  snapshot: ResearchSnapshot,
): MaterializedSnapshot {
  const treemaps = blankTreemaps();
  const root = selectionTree(snapshot);
  const displaySlot = treemapSlot(snapshot) ?? "events";
  const slots = treemaps as unknown as Record<string, TreemapNode<number | string>>;
  const current = slots[displaySlot];
  slots[displaySlot] = {
    ...current,
    ...root,
    children: root.children ?? [],
  };
  const ancestorNames = snapshot.selectedNodes[0]?.path ?? [];
  const path = walkPath(slots[displaySlot], ancestorNames);

  const data: ActivityVisualizationResponse = {
    period: snapshot.period,
    start: snapshot.generatedAt,
    end: snapshot.generatedAt,
    source: snapshot.source ?? "fixture",
    sourceTimestamp: snapshot.generatedAt,
    isPeriodComplete: true,
    fixture: (snapshot.source ?? "fixture") !== "hubble",
    kpis: snapshot.kpis,
    treemaps,
    metricProvenance: buildActivityMetricProvenance(
      snapshot.network ?? "mainnet",
    ),
  };

  return { data, path, selected: toSelected(snapshot) };
}
