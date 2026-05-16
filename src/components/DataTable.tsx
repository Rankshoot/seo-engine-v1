import React, { ReactNode, RefObject } from "react";
import { TableSkeleton } from "@/components/Skeleton";
import { Tooltip, InfoIcon } from "@/components/Tooltip";

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
  
  // Sorting
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  onSortToggle?: (columnId: string) => void;
  
  // Selection
  massSelectMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  isSelectable?: (row: T) => boolean;
  selectionDisabled?: boolean;
  
  // Row interaction
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  
  // States
  isLoading?: boolean;
  loadingRows?: number;
  loadingColumns?: number;
  emptyState?: ReactNode;
  
  // Table sizing
  minWidth?: string;

  /** When set, attached to the inner scroll container (for programmatic scroll, e.g. load-more). */
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  
  // Footer
  footer?: ReactNode;
}

const thBtnClass =
  "group inline-flex items-center gap-0.5 rounded-[6px] px-1 py-0.5 -mx-1 text-left uppercase tracking-widest hover:bg-surface-hover/80 hover:text-text-secondary transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-action/40";

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
  const sortMark = (colId: string) =>
    sortColumn !== colId ? (
      <span className="ml-1 text-[11px] font-normal normal-case tracking-normal text-text-tertiary/40" aria-hidden>
        ↕
      </span>
    ) : (
      <span className="ml-1 text-brand-action" aria-hidden>
        {sortDirection === "asc" ? "↑" : "↓"}
      </span>
    );

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

  return (
    <div className="overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated">
      <div ref={scrollContainerRef} className="max-h-[min(70vh,56rem)] overflow-auto">
        <table className="w-full text-left border-collapse" style={{ minWidth }}>
          <thead className="sticky top-0 z-10 bg-surface-secondary text-[12px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
            <tr>
              <th
                scope="col"
                className={`border-border-subtle align-middle transition-[width,padding] duration-300 ease-out ${
                  massSelectMode ? "w-12 px-4 py-3 opacity-100" : "w-0 max-w-0 border-0 p-0 opacity-0"
                } overflow-hidden`}
              >
                <span
                  className={`block min-h-5 transition-all duration-300 ease-out ${massSelectMode ? "opacity-100" : "opacity-0"}`}
                  aria-hidden
                />
              </th>
              {columns.map(col => (
                <th
                  key={col.id}
                  scope="col"
                  className={`px-4 py-3 ${
                    col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                  }`}
                >
                  <div
                    className={`flex items-center gap-1.5 ${
                      col.align === "right" ? "justify-end" : col.align === "center" ? "justify-center" : "justify-start"
                    }`}
                  >
                    {col.sortable && onSortToggle ? (
                      <button type="button" className={thBtnClass} onClick={() => onSortToggle(col.id)}>
                        {col.header}
                        {sortMark(col.id)}
                      </button>
                    ) : (
                      <span>{col.header}</span>
                    )}
                    {col.tooltip && (
                      <Tooltip placement="below" content={col.tooltip}>
                        <InfoIcon />
                      </Tooltip>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle/60">
            {data.map((row, i) => {
              const rowId = keyExtractor(row);
              const selectable = isSelectable ? isSelectable(row) : true;
              const isSelected = selectedIds.has(rowId);
              
              return (
                <tr
                  key={rowId}
                  data-table-row-key={rowId}
                  onClick={e => {
                    const t = e.target as HTMLElement;
                    if (
                      t.closest(
                        "button, input, select, textarea, label, [data-keyword-action], [role='menu'], [role='menuitem'], [role='listbox'], [role='option'], a"
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
                  }}
                  className={`transition-colors duration-150 hover:bg-surface-hover/90 ${
                    scrollContainerRef ? "scroll-mt-12" : ""
                  } ${rowClassName ? rowClassName(row) : ""} ${
                    massSelectMode && selectable && !selectionDisabled ? "cursor-pointer" : onRowClick ? "cursor-pointer" : ""
                  }`}
                >
                  <td
                    data-row-no-mass
                    className={`border-border-subtle align-middle transition-[width,padding] duration-300 ease-out ${
                      massSelectMode ? "w-12 px-4 py-3 opacity-100" : "w-0 max-w-0 border-0 p-0 opacity-0"
                    } overflow-hidden`}
                  >
                    <span
                      className={`flex justify-center transition-all duration-300 ease-out ${
                        massSelectMode ? "opacity-100 scale-100 translate-x-0" : "pointer-events-none -translate-x-2 scale-90 opacity-0"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          if (selectable && onToggleSelect && !selectionDisabled) onToggleSelect(rowId);
                        }}
                        onClick={e => e.stopPropagation()}
                        disabled={!massSelectMode || !selectable || selectionDisabled}
                        aria-label={`Select row`}
                        className="rounded border-border-subtle text-brand-action focus:ring-brand-action"
                      />
                    </span>
                  </td>
                  {columns.map(col => (
                    <td
                      key={col.id}
                      className={`px-4 py-3 align-middle ${
                        col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                      }`}
                    >
                      {col.cell(row, i)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}
