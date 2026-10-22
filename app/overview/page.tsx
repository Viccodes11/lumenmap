"use client";

import { OverviewSection } from "@/components/dashboard/OverviewSection";
import { DashboardProvider } from "@/components/dashboard/DashboardProvider";

export default function OverviewPage() {
  return (
    <DashboardProvider>
      <OverviewSection />
    </DashboardProvider>
  );
}
