/**
 * Common UI primitives — single import surface for the design system.
 *
 *   import { Button, Card, PageShell, EmptyState } from "@/components/common";
 *
 * Pages and feature components should reach for primitives from here before
 * inlining their own ad-hoc cards/buttons/badges/etc.
 */

export * from "./buttons/Button";
export * from "./cards/Card";
export * from "./cards/StatCard";
export * from "./typography/Typography";
export * from "./forms/Input";
export * from "./badges/Badge";
export * from "./layouts/PageShell";
export * from "./empty-states/EmptyState";
export * from "./loaders/Spinner";
export * from "./dialogs/Dialog";
export * from "./dropdowns/DropdownMenu";

// Re-exports of existing primitives so callers can import everything from one place.
export { Skeleton, TableSkeleton, KeywordTableSkeleton, BusinessBriefSkeleton, CardGridSkeleton, StatStripSkeleton } from "@/components/Skeleton";
export { DataTable } from "@/components/DataTable";
export type { ColumnDef, DataTableProps } from "@/components/DataTable";
export { Tooltip, InfoIcon } from "@/components/Tooltip";
