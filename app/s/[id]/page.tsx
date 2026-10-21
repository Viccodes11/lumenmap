import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { SnapshotMissing } from "@/components/dashboard/SnapshotBanner";
import { getSnapshot } from "@/lib/snapshots/store";

export default async function SnapshotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const snapshot = getSnapshot(id);
  if (!snapshot) return <SnapshotMissing />;
  return <DashboardPage snapshot={snapshot} />;
}
