import type { ActivityVisualizationResponse, Period, TreemapNode } from "@/lib/types";
import type { TreemapViewId } from "@/lib/constants";
import { EXPORT_THEME_TOKENS, recolorSvgMarkupForExportTheme, type ExportTheme } from "@/lib/export-theme";

export interface ExportMetadata {
  metric: string;
  unit: string;
  period: Period;
  timezone: string;
  freshness: string;
  filters: Record<string, string>;
  generatedAt: string;
  view: TreemapViewId;
}

export function generateSafeFilename(
  prefix: string,
  metric: string,
  period: Period,
  extension: string,
  timestamp?: string
): string {
  const safeMetric = metric.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const safePeriod = period.replace(/[^a-z0-9]/g, "");
  const datePart = timestamp || new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${prefix}-${safeMetric}-${safePeriod}-${datePart}.${extension}`;
}

export function buildExportMetadata(
  data: ActivityVisualizationResponse | undefined,
  period: Period,
  treemapView: TreemapViewId,
  viewLabel: string
): ExportMetadata {
  const now = new Date();
  const freshness = data?.end ? new Date(data.end).toISOString() : now.toISOString();

  return {
    metric: viewLabel || "Network Activity",
    unit: "operations",
    period,
    timezone: "UTC",
    freshness,
    filters: {
      period,
      view: treemapView,
      source: data?.source || "hubble",
    },
    generatedAt: now.toISOString(),
    view: treemapView,
  };
}

export function exportSvgToPng(
  svgElement: SVGSVGElement,
  filename: string,
  scale: number = 2,
  theme: ExportTheme = "dark"
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const serializer = new XMLSerializer();
      let svgString = serializer.serializeToString(svgElement);
      svgString = recolorSvgMarkupForExportTheme(svgString, theme);

      // Ensure proper namespace and dimensions for export
      if (!svgString.includes("xmlns=")) {
        svgString = svgString.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
      }

      const width = svgElement.width.baseVal.value || 800;
      const height = svgElement.height.baseVal.value || 600;

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(width * scale);
      canvas.height = Math.floor(height * scale);
      const ctx = canvas.getContext("2d", { alpha: true });

      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.fillStyle = EXPORT_THEME_TOKENS[theme].background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const img = new Image();
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Failed to generate PNG blob"));
            return;
          }
          const link = document.createElement("a");
          link.download = filename;
          link.href = URL.createObjectURL(blob);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
          resolve();
        }, "image/png");
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load SVG for PNG export"));
      };

      img.src = url;
    } catch (error) {
      reject(error);
    }
  });
}

export function exportToCsv(
  rows: Record<string, unknown>[],
  filename: string,
  metadata: ExportMetadata,
  syntheticRows?: string[]
): void {
  if (!rows || rows.length === 0) {
    console.warn("No rows to export");
    return;
  }

  const headers = Object.keys(rows[0]);

  // Metadata as CSV comments
  const metaLines = [
    `# LumenMap Export`,
    `# Metric: ${metadata.metric}`,
    `# Unit: ${metadata.unit}`,
    `# Period: ${metadata.period}`,
    `# Timezone: ${metadata.timezone}`,
    `# Freshness: ${metadata.freshness}`,
    `# Generated: ${metadata.generatedAt}`,
    `# Filters: ${Object.entries(metadata.filters).map(([k, v]) => `${k}=${v}`).join(", ")}`,
    `# View: ${metadata.view}`,
    `# Synthetic remainder rows identified: ${syntheticRows ? syntheticRows.join(", ") : "other"}`,
    "",
  ];

  const csvContent = [
    ...metaLines,
    headers.join(","),
    ...rows.map((row) => {
      const values = headers.map((header) => {
        let val = row[header];
        if (val === null || val === undefined) val = "";
        const str = String(val).replace(/"/g, '""');
        // Identify synthetic rows (e.g., "other" category or remainder)
        if (syntheticRows && syntheticRows.some(s => String(val).toLowerCase().includes(s.toLowerCase()))) {
          return `"${str} [synthetic]"`;
        }
        return `"${str}"`;
      });
      return values.join(",");
    }),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function flattenTreemapForCsv(node: TreemapNode & { children?: TreemapNode[] }, path: string[] = []): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const currentPath = [...path, node.name];

  const row: Record<string, unknown> = {
    path: currentPath.join(" > "),
    name: node.name,
    value: node.value ?? node.meta?.opCount ?? 0,
    share: node.meta?.share ?? null,
    category: node.meta?.category ?? null,
    type: node.meta?.type ?? null,
    id: node.meta?.id ?? node.id ?? null,
    protocol: node.meta?.protocol ?? null,
    eventType: node.meta?.eventType ?? null,
    childCount: node.meta?.childCount ?? (node.children?.length ?? 0),
    is_synthetic: node.name.toLowerCase().includes("other") || node.name.toLowerCase().includes("remainder") ? "yes" : "no",
  };

  result.push(row);

  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      result.push(...flattenTreemapForCsv(child, currentPath));
    }
  }

  return result;
}

export function getStructuredRowsForExport(
  data: ActivityVisualizationResponse | undefined,
  treemapView: TreemapViewId
): { rows: Record<string, unknown>[]; syntheticIdentifiers: string[] } {
  const syntheticIdentifiers = ["other", "remainder"];
  if (treemapView === "flow" || !data?.treemaps || !(treemapView in data.treemaps)) {
    return { rows: [], syntheticIdentifiers };
  }
  const tree = data.treemaps[treemapView as "events" | "actors"];
  if (!tree) {
    return { rows: [], syntheticIdentifiers };
  }
  const rows = flattenTreemapForCsv(tree).map((row) => ({
    ...row,
    is_synthetic:
      String(row.name ?? "").toLowerCase().includes("other") ||
      String(row.path ?? "").toLowerCase().includes("other")
        ? "yes"
        : "no",
  }));
  return { rows, syntheticIdentifiers };
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Minimal single-page PDF (text only) — no third-party dependency. */
export function buildTextPdf(lines: string[]): Blob {
  const contentLines = lines.flatMap((line, index) => {
    const y = 800 - index * 16;
    return [`BT /F1 11 Tf 48 ${y} Td (${escapePdfText(line)}) Tj ET`];
  });
  const stream = contentLines.join("\n");
  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj",
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream endobj`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  const byteLength = (value: string) => new TextEncoder().encode(value).length;
  for (const object of objects) {
    offsets.push(byteLength(pdf));
    pdf += `${object}\n`;
  }
  const xrefStart = byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

export type DashboardPdfInput = {
  metadata: ExportMetadata;
  kpiLines: string[];
  chartTitle: string;
  loading: boolean;
};

export function buildDashboardPdfDocument(input: DashboardPdfInput): Blob {
  if (input.loading) {
    throw new Error("Charts are still loading. Wait for data before exporting PDF.");
  }
  const periodLabel = input.metadata.period;
  const dataThrough = input.metadata.freshness;
  const lines = [
    "LumenMap dashboard export",
    `Period: ${periodLabel}`,
    `Data through: ${dataThrough}`,
    `Generated: ${input.metadata.generatedAt}`,
    `View: ${input.metadata.view}`,
    `Metric: ${input.metadata.metric}`,
    "",
    "KPI values",
    ...input.kpiLines,
    "",
    `Active chart: ${input.chartTitle}`,
    "",
    "Source filters:",
    ...Object.entries(input.metadata.filters).map(([key, value]) => `${key}=${value}`),
  ];
  return buildTextPdf(lines);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface FlowExportEdge {
  from?: string;
  source?: string;
  to?: string;
  destination?: string;
  assetKey?: string;
  asset?: { code: string } | string;
  amount: string | number;
  op_count?: number;
  operationCount?: number;
}

function resolveFlowEdgeAsset(edge: FlowExportEdge): string {
  if (typeof edge.asset === "string") {
    return edge.asset;
  }
  if (edge.asset && typeof edge.asset === "object" && "code" in edge.asset && edge.asset.code) {
    return edge.asset.code;
  }
  if (edge.assetKey) {
    if (edge.assetKey === "native:XLM" || edge.assetKey === "native") {
      return "XLM";
    }
    if (edge.assetKey.includes(":")) {
      const [code, issuer] = edge.assetKey.split(":");
      return code === "native" ? (issuer || "XLM") : code;
    }
    return edge.assetKey;
  }
  return "";
}

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function serializeFlowEdgesToCsv(
  edges: readonly FlowExportEdge[]
): string {
  const header = "from,to,asset,amount,op_count";
  if (!edges || edges.length === 0) {
    return `${header}\n`;
  }

  const rows = edges.map((edge) => {
    const from = edge.from ?? edge.source ?? "";
    const to = edge.to ?? edge.destination ?? "";
    const asset = resolveFlowEdgeAsset(edge);
    const amount =
      edge.amount !== undefined && edge.amount !== null ? String(edge.amount) : "0";
    const opCount = edge.op_count ?? edge.operationCount ?? 0;

    return [
      escapeCsvField(from),
      escapeCsvField(to),
      escapeCsvField(asset),
      escapeCsvField(amount),
      escapeCsvField(opCount),
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

export function generateFlowEdgesFilename(
  period: Period | string,
  timestamp?: string
): string {
  const safePeriod = (String(period).replace(/[^a-z0-9]/gi, "").toLowerCase() || "custom") as Period;
  return generateSafeFilename("lumenmap-flow", "edges", safePeriod, "csv", timestamp);
}

export function exportFlowEdgesToCsv(
  edges: readonly FlowExportEdge[],
  period: Period | string = "24h",
  timestamp?: string
): void {
  if (!edges || edges.length === 0) {
    console.warn("No flow edges to export");
    return;
  }
  const csvContent = serializeFlowEdgesToCsv(edges);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const filename = generateFlowEdgesFilename(period, timestamp);
  downloadBlob(blob, filename);
}

