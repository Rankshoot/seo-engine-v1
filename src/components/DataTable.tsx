"use client";

import React, { ReactNode, RefObject, useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef as TanstackColumnDef,
} from "@tanstack/react-table";
import { TableSkeleton } from "@/components/Skeleton";
import { Tooltip, InfoIcon } from "@/components/Tooltip";

import { cn } from "@/lib/cn";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface ColumnDef<T> {
  id: string;
  header: ReactNode | string;
  tooltip?: ReactNode;
  align?: "left" | "center" | "right";
  cell: (row: T, index: number) => ReactNode;
  sortable?: boolean;
}

export interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  keyExtractor: (row: T) => string;

  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  onSortToggle?: (columnId: string) => void;

  massSelectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  isSelectable?: (row: T) => boolean;
  selectionDisabled?: boolean;

  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;

  isLoading?: boolean;
  loadingRows?: number;
  loadingColumns?: number;
  emptyState?: ReactNode;

  minWidth?: string;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;

  footer?: ReactNode;
}

const thBtnClass =
  "group inline-flex items-center gap-0.5 rounded-[6px] px-1 py-0.5 -mx-1 text-left uppercase tracking-widest hover:bg-surface-hover/80 hover:text-text-secondary transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-action/40";

const alignClass = (align?: "left" | "center" | "right") =>
  align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

const flexAlign = (align?: "left" | "center" | "right") =>
  align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

function SortMark({ colId, sortColumn, sortDirection }: { colId: string; sortColumn?: string; sortDirection?: "asc" | "desc" }) {
  if (sortColumn !== colId) {
    return (
      <span className="ml-1 text-[11px] font-normal normal-case tracking-normal text-text-tertiary/40" aria-hidden>
        ↕
      </span>
    );
  }
  return (
    <span className="ml-1 text-brand-action" aria-hidden>
      {sortDirection === "asc" ? "↑" : "↓"}
    </span>
  );
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  sortColumn,
  sortDirection,
  onSortToggle,
  massSelectMode = false,
  selectedIds = new Set(),
  onToggleSelect,
  isSelectable,
  selectionDisabled = false,
  onRowClick,
  rowClassName,
  isLoading,
  loadingRows = 8,
  loadingColumns = 6,
  emptyState,
  minWidth = "860px",
  scrollContainerRef,
  footer,
}: DataTableProps<T>) {
  const tanstackColumns = useMemo((): TanstackColumnDef<T>[] => {
    const dataCols: TanstackColumnDef<T>[] = columns.map(col => ({
      id: col.id,
      header: () => (
        <div className={cn("flex items-center gap-1.5", flexAlign(col.align))}>
          {col.sortable && onSortToggle ? (
            <button type="button" className={thBtnClass} onClick={() => onSortToggle(col.id)}>
              {col.header}
              <SortMark colId={col.id} sortColumn={sortColumn} sortDirection={sortDirection} />
            </button>
          ) : (
            <span>{col.header}</span>
          )}
          {col.tooltip ? (
            <Tooltip placement="below" content={col.tooltip}>
              <InfoIcon />
            </Tooltip>
          ) : null}
        </div>
      ),
      cell: ({ row }) => col.cell(row.original, row.index),
      meta: { align: col.align },
    }));

    return dataCols;
  }, [columns, onSortToggle, sortColumn, sortDirection]);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table API
  const table = useReactTable({
    data,
    columns: tanstackColumns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: row => keyExtractor(row),
  });

  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated">
        <TableSkeleton rows={loadingRows} columns={loadingColumns} />
      </div>
    );
  }

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const handleRowClick = (row: T, rowId: string, selectable: boolean, e: React.MouseEvent<HTMLTableRowElement>) => {
    const t = e.target as HTMLElement;
    if (
      t.closest(
        "button, input, select, textarea, label, [data-keyword-action], [role='menu'], [role='menuitem'], [role='listbox'], [role='option'], a",
      ) ||
      t.closest("[data-row-no-mass]")
    ) {
      return;
    }
    if (massSelectMode) {
      if (selectable && onToggleSelect && !selectionDisabled) onToggleSelect(rowId);
      return;
    }
    if (onRowClick) onRowClick(row);
  };

  return (
    <div className="overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated">
      <div ref={scrollContainerRef} className="max-h-[min(70vh,56rem)] overflow-auto">
        <Table style={{ minWidth }}>
          <TableHeader className="sticky top-0 z-10 bg-surface-secondary">
            {table.getHeaderGroups().map(headerGroup => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent border-border-subtle">
                <TableHead
                  scope="col"
                  className={cn(
                    "border-border-subtle transition-[width,padding] duration-300 ease-out",
                    massSelectMode ? "w-12 px-4 py-3 opacity-100" : "w-0 max-w-0 border-0 p-0 opacity-0",
                    "overflow-hidden",
                  )}
                >
                  <span
                    className={cn("block min-h-5 transition-all duration-300 ease-out", massSelectMode ? "opacity-100" : "opacity-0")}
                    aria-hidden
                  />
                </TableHead>
                {headerGroup.headers.map(header => {
                  const align = (header.column.columnDef.meta as { align?: "left" | "center" | "right" })?.align;
                  return (
                    <TableHead key={header.id} scope="col" className={cn("py-3", alignClass(align))}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className="divide-y divide-border-subtle/60">
            {table.getRowModel().rows.map(row => {
              const original = row.original;
              const rowId = keyExtractor(original);
              const selectable = isSelectable ? isSelectable(original) : true;
              const isSelected = selectedIds.has(rowId);

              return (
                <TableRow
                  key={row.id}
                  data-table-row-key={rowId}
                  data-state={isSelected ? "selected" : undefined}
                  onClick={e => handleRowClick(original, rowId, selectable, e)}
                  className={cn(
                    "transition-colors duration-150 hover:bg-surface-hover/90",
                    scrollContainerRef ? "scroll-mt-12" : "",
                    rowClassName?.(original),
                    massSelectMode && selectable && !selectionDisabled
                      ? "cursor-pointer"
                      : onRowClick
                        ? "cursor-pointer"
                        : "",
                  )}
                >
                  <TableCell
                    data-row-no-mass
                    className={cn(
                      "border-border-subtle transition-[width,padding] duration-300 ease-out",
                      massSelectMode ? "w-12 px-4 py-3 opacity-100" : "w-0 max-w-0 border-0 p-0 opacity-0",
                      "overflow-hidden",
                    )}
                  >
                    <span
                      className={cn(
                        "flex justify-center transition-all duration-300 ease-out",
                        massSelectMode ? "opacity-100 scale-100 translate-x-0" : "pointer-events-none -translate-x-2 scale-90 opacity-0",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          if (selectable && onToggleSelect && !selectionDisabled) onToggleSelect(rowId);
                        }}
                        onClick={e => e.stopPropagation()}
                        disabled={!massSelectMode || !selectable || selectionDisabled}
                        aria-label="Select row"
                        className="rounded border-border-subtle text-brand-action focus:ring-brand-action"
                      />
                    </span>
                  </TableCell>
                  {row.getVisibleCells().map(cell => {
                    const align = (cell.column.columnDef.meta as { align?: "left" | "center" | "right" })?.align;
                    return (
                      <TableCell key={cell.id} className={alignClass(align)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {footer}
    </div>
  );
}
