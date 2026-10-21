"use client";

import { useState } from "react";
import { useDashboard } from "@/components/dashboard/DashboardProvider";
import { Button } from "@/components/ui/button";
import { compactTreemap, fitSnapshotBody } from "@/lib/snapshots/compact";
import { treemapSlot } from "@/lib/snapshots/materialize";
import type { SnapshotSelectedNode, SnapshotViewId } from "@/lib/snapshots/types";
import type { TreemapNode } from "@/lib/types";

function selectedNodesFromDashboard(
  selectedName: string | undefined,
  selectedId: string | undefined,
  selectedValue: number | undefined,
  selectedShare: number | undefined,
  path: string[],
): SnapshotSelectedNode[] {
  if (!selectedName) return [];
  return [
    {
      name: selectedName,
      id: selectedId,
      value: selectedValue,
      share: selectedShare,
      path: path.length > 0 ? path : undefined,
    },
  ];
}

export function SnapshotShareControls() {
  const {
    readOnly,
    period,
    metric,
    treemapView,
    chartView,
    selectedNode,
    activeLevelPath,
    data,
    network,
  } = useDashboard();
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  if (readOnly) return null;

  const view: SnapshotViewId = chartView === "flow" ? "flow" : treemapView === "flow" ? "flow" : treemapView;

  const createLink = async () => {
    if (!data?.kpis) {
      setMessage("Load the dashboard before creating a snapshot.");
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const selectedNodes = selectedNodesFromDashboard(
        selectedNode?.name,
        selectedNode?.meta?.id,
        selectedNode?.value,
        selectedNode?.share,
        activeLevelPath.map((node) => node.name),
      );
      const slot = treemapSlot({ metric, view });
      const liveRoot = slot ? data.treemaps[slot] : undefined;
      const body = fitSnapshotBody({
        period,
        metric,
        view,
        selectedNodes,
        kpis: data.kpis,
        source: data.source,
        network,
        treemap: liveRoot
          ? compactTreemap(liveRoot as TreemapNode<number | string>, selectedNodes)
          : undefined,
      });
      const response = await fetch("/api/v1/snapshots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 413) {
        setLink("");
        setMessage("This view is too large to snapshot.");
        return;
      }
      if (!response.ok) {
        setLink("");
        setMessage("Could not create a snapshot.");
        return;
      }
      const payload = (await response.json()) as { url: string };
      const shareUrl = `${window.location.origin}${payload.url}`;
      setLink(shareUrl);
      setMessage("Shareable snapshot link ready.");
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setMessage("Shareable snapshot link copied.");
      }
    } catch {
      setMessage("Could not create a snapshot.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section
      aria-label="Share research snapshot"
      className="flex w-full min-w-0 flex-col gap-2 sm:max-w-xl"
    >
      <Button type="button" onClick={() => void createLink()} disabled={pending || !data}>
        {pending ? "Creating snapshot…" : "Create snapshot link"}
      </Button>
      {link ? (
        <label className="min-w-0 text-xs text-zinc-400">
          Shareable URL
          <input
            readOnly
            value={link}
            aria-label="Shareable snapshot URL"
            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      ) : null}
      {message ? (
        <p role="status" className="text-xs text-zinc-400">
          {message}
        </p>
      ) : null}
    </section>
  );
}
