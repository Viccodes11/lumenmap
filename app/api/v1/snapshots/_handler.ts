import { NextResponse } from "next/server";
import { snapshotMaxBytes, snapshotTtlSeconds } from "@/lib/snapshots/constants";
import { hashKpiPayload } from "@/lib/snapshots/hash";
import { getSnapshot, saveSnapshot } from "@/lib/snapshots/store";
import { parseSnapshotBody } from "@/lib/snapshots/validate";
import { enforceRateLimit } from "@/lib/rate-limit";

function tooLarge() {
  const maxBytes = snapshotMaxBytes();
  return NextResponse.json(
    {
      code: "PAYLOAD_TOO_LARGE",
      message: `Snapshot body exceeds the maximum size of ${maxBytes} bytes.`,
      maxBytes,
    },
    { status: 413, headers: { "Cache-Control": "no-store" } },
  );
}

function notFound() {
  return NextResponse.json(
    {
      code: "SNAPSHOT_NOT_FOUND",
      message: "This research snapshot is missing or has expired.",
    },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}

export async function handleCreateSnapshot(request: Request): Promise<Response> {
  const limited = enforceRateLimit(request, "v1");
  if (limited) return limited;

  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > snapshotMaxBytes()) {
    return tooLarge();
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > snapshotMaxBytes()) {
    return tooLarge();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { code: "INVALID_SNAPSHOT", message: "Snapshot body must be JSON." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const result = parseSnapshotBody(parsed);
  if (!result.ok) {
    return NextResponse.json(
      { code: "INVALID_SNAPSHOT", message: result.message },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const snapshot = saveSnapshot({
    ...result.draft,
    kpiPayloadHash: hashKpiPayload(result.draft.kpis),
  });

  return NextResponse.json(
    {
      id: snapshot.id,
      url: `/s/${snapshot.id}`,
      ttlSeconds: snapshotTtlSeconds(),
      maxBytes: snapshotMaxBytes(),
      snapshot,
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

export async function handleGetSnapshot(
  request: Request,
  id: string,
): Promise<Response> {
  const limited = enforceRateLimit(request, "v1");
  if (limited) return limited;

  const snapshot = getSnapshot(id);
  if (!snapshot) return notFound();
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store" },
  });
}
