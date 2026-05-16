"use client";

import { StatCard, type StatCardProps } from "@/components/common";

/** Thin wrapper so admin pages share KPI styling. */
export function AdminMetricCard(props: StatCardProps) {
  return <StatCard {...props} />;
}
