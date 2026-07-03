"use client";

import React, { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TableSkeleton } from "@/components/Skeleton";
import { Tooltip, InfoIcon } from "@/components/Tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface ColumnDef<T> {
  id: string;
  header: ReactNode | string;
  tooltip?: ReactNode;
  align?: "left" | "center" | "right";
  cell: (row: T, index: number) => ReactNode;
  sortable?: boolean;
}

export interface SharedKeywordTableProps<T> {
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
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;

  controls?: ReactNode;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
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

export function SharedKeywordTable<T>({
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
  controls,
  footerLeft,
  footerRight,
}: SharedKeywordTableProps<T>) {
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
    <div className="flex flex-col h-full min-h-0 w-full">
      {/* 1. Sticky Filter / Controls bar */}
      {controls && (
        <div className="shrink-0 sticky top-0 z-30 pb-4 bg-surface-primary">
          {controls}
        </div>
      )}

      {/* 2. Loading State */}
      {isLoading ? (
        <div className="flex-1 overflow-hidden border border-border-subtle rounded-md">
          <TableSkeleton rows={loadingRows} columns={loadingColumns} />
        </div>
      ) : (
        /* 3. Table Container: The ONLY element that scrolls vertically */
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto relative border border-border-subtle rounded-md"
        >
          <Table style={{ minWidth }} className="w-full text-left border-collapse">
            {/* Table Header with Sticky and Backdrop Blur classes */}
            <thead className="sticky top-0 z-20 bg-surface-secondary backdrop-blur-md">
              <TableRow className="hover:bg-transparent border-b border-border-subtle">
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
                {columns.map(col => (
                  <TableHead
                    key={col.id}
                    scope="col"
                    className={cn("py-3 px-4 font-bold text-[12px] uppercase tracking-widest text-text-tertiary", alignClass(col.align))}
                  >
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
                  </TableHead>
                ))}
              </TableRow>
            </thead>
            <TableBody className="divide-y divide-border-subtle/60">
              {data.length === 0 && emptyState ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={columns.length + (massSelectMode ? 1 : 0)}
                    className="py-12 border-0"
                  >
                    {emptyState}
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row, index) => {
                  const rowId = keyExtractor(row);
                  const selectable = isSelectable ? isSelectable(row) : true;
                  const isSelected = selectedIds.has(rowId);

                  return (
                  <TableRow
                    key={rowId}
                    data-table-row-key={rowId}
                    data-state={isSelected ? "selected" : undefined}
                    onClick={e => handleRowClick(row, rowId, selectable, e)}
                    className={cn(
                      "transition-colors duration-150 hover:bg-surface-hover/90 border-b border-border-subtle/60",
                      scrollContainerRef ? "scroll-mt-12" : "",
                      rowClassName?.(row),
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
                    {columns.map(col => (
                      <TableCell key={col.id} className={cn("px-4 py-3 align-middle", alignClass(col.align))}>
                        {col.cell(row, index)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
              {(footerLeft || footerRight) && (
                <TableRow className="hover:bg-transparent bg-surface-secondary/30 border-t border-border-subtle">
                  <TableCell
                    colSpan={columns.length + 1}
                    className="px-6 py-3.5 align-middle"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>{footerLeft}</div>
                      <div>{footerRight}</div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

