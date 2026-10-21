import { snapshotMaxBytes } from "@/lib/snapshots/constants";
import type { SnapshotSelectedNode } from "@/lib/snapshots/types";
import type { TreemapNode } from "@/lib/types";

const MAX_CHILDREN = 20;
const MAX_DEPTH = 3;

function compactNode(
  node: TreemapNode<number | string>,
  depth: number,
  keep: Set<string>,
): TreemapNode<number | string> {
  const children = node.children ?? [];
  const preferred = children.filter(
    (child) => keep.has(child.name) || (child.id ? keep.has(child.id) : false),
  );
  const others = children.filter((child) => !preferred.includes(child));
  const limited = [...preferred, ...others].slice(0, MAX_CHILDREN);

  return {
    id: node.id,
    name: node.name,
    value:
      typeof node.value === "number" || typeof node.value === "string"
        ? node.value
        : undefined,
    meta: node.meta
      ? {
          type: node.meta.type,
          id: node.meta.id,
          category: node.meta.category,
          share: node.meta.share,
          opCount: node.meta.opCount,
        }
      : undefined,
    children:
      depth >= MAX_DEPTH ? [] : limited.map((child) => compactNode(child, depth + 1, keep)),
  };
}

export function compactTreemap(
  root: TreemapNode<number | string>,
  selectedNodes: SnapshotSelectedNode[],
): TreemapNode<number | string> {
  const keep = new Set<string>();
  for (const node of selectedNodes) {
    keep.add(node.name);
    if (node.id) keep.add(node.id);
    for (const segment of node.path ?? []) keep.add(segment);
  }
  return compactNode(root, 0, keep);
}

export function jsonByteLength(value: unknown): number {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  return encoded.byteLength;
}

/** Drops the treemap when the body would exceed the documented byte cap. */
export function fitSnapshotBody<T extends { treemap?: TreemapNode<number | string> }>(body: T): T {
  if (!body.treemap) return body;
  if (jsonByteLength(body) <= snapshotMaxBytes()) return body;
  const next = { ...body };
  delete next.treemap;
  return next;
}
