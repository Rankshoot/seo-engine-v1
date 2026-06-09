"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import type { ContentType } from "@/lib/types";

export interface UseKeywordTableStateProps<T> {
  data: T[];
  filter: "all" | "unscheduled" | "scheduled" | "generated";
  keyExtractor: (item: T) => string;
  checkScheduled: (item: T) => boolean;
  checkGenerated: (item: T) => boolean;
  getSearchString?: (item: T) => string;
  // External sorting (e.g. Redux)
  externalSortColumn?: string;
  externalSortDirection?: "asc" | "desc";
  onSortToggle?: (columnId: string) => void;
  // Internal/Fallback sorting
  initialSortColumn?: string;
  initialSortDirection?: "asc" | "desc";
  compareFn: (a: T, b: T, columnId: string, direction: "asc" | "desc") => number;
  alwaysShowAll?: boolean;
}

const PAGE_SIZE = 20;

export function useKeywordTableState<T>({
  data,
  filter,
  keyExtractor,
  checkScheduled,
  checkGenerated,
  getSearchString,
  externalSortColumn,
  externalSortDirection,
  onSortToggle,
  initialSortColumn = "",
  initialSortDirection = "desc",
  compareFn,
  alwaysShowAll = false,
}: UseKeywordTableStateProps<T>) {
  // 1. Search Query
  const [searchQuery, setSearchQuery] = useState("");

  // 2. Selection States
  const [massSelectMode, setMassSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 3. Row Content Types
  const [rowContentTypes, setRowContentTypes] = useState<Record<string, ContentType>>({});

  // 4. Local Sorting State (used if no external handlers are passed)
  const [localSortColumn, setLocalSortColumn] = useState(initialSortColumn);
  const [localSortDirection, setLocalSortDirection] = useState<"asc" | "desc">(initialSortDirection);

  const activeSortColumn = externalSortColumn !== undefined ? externalSortColumn : localSortColumn;
  const activeSortDirection = externalSortDirection !== undefined ? externalSortDirection : localSortDirection;

  // 5. Pagination / Visible Range
  const [visibleCount, setVisibleCount] = useState(alwaysShowAll ? 20 : PAGE_SIZE);

  // Toggle selection for a single row
  const toggleRowSelected = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const exitMassSelect = useCallback(() => {
    setMassSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // Update content type selections
  const setRowContentType = useCallback((keyword: string, type: ContentType) => {
    setRowContentTypes(prev => ({
      ...prev,
      [keyword.toLowerCase()]: type,
    }));
  }, []);

  // Compute counts based on raw dataset
  const counts = useMemo(() => {
    let all = 0;
    let unscheduled = 0;
    let scheduled = 0;
    let generated = 0;
    for (const item of data) {
      all += 1;
      const isSch = checkScheduled(item);
      const isGen = checkGenerated(item);
      if (isSch) scheduled += 1;
      else unscheduled += 1;
      if (isGen) generated += 1;
    }
    return { all, unscheduled, scheduled, generated };
  }, [data, checkScheduled, checkGenerated]);

  // Handle local or external sorting
  const handleSortToggle = useCallback((columnId: string) => {
    if (onSortToggle) {
      onSortToggle(columnId);
    } else {
      if (localSortColumn === columnId) {
        setLocalSortDirection(dir => (dir === "asc" ? "desc" : "asc"));
      } else {
        setLocalSortColumn(columnId);
        // Default sort direction logic: asc for keyword/text fields, desc for numeric/score fields
        const isAscDefault = columnId === "keyword" || columnId === "gap_type" || columnId === "intent";
        setLocalSortDirection(isAscDefault ? "asc" : "desc");
      }
    }
  }, [onSortToggle, localSortColumn]);

  // Filter raw data by search query and active tab
  const filteredData = useMemo(() => {
    return data.filter(item => {
      if (searchQuery.trim() && getSearchString) {
        const searchStr = getSearchString(item);
        if (!searchStr.toLowerCase().includes(searchQuery.toLowerCase().trim())) {
          return false;
        }
      }

      const isSch = checkScheduled(item);
      const isGen = checkGenerated(item);
      if (filter === "scheduled") return isSch;
      if (filter === "unscheduled") return !isSch;
      if (filter === "generated") return isGen;
      return true;
    });
  }, [data, searchQuery, filter, getSearchString, checkScheduled, checkGenerated]);

  // Sort filtered data
  const processedData = useMemo(() => {
    const sorted = [...filteredData];
    if (activeSortColumn) {
      sorted.sort((a, b) => compareFn(a, b, activeSortColumn, activeSortDirection));
    }
    return sorted;
  }, [filteredData, activeSortColumn, activeSortDirection, compareFn]);

  // Paginated chunk
  const displayedData = useMemo(() => {
    return processedData.slice(0, visibleCount);
  }, [processedData, visibleCount]);

  const hasMore = visibleCount < processedData.length;
  const remaining = processedData.length - visibleCount;

  const loadMore = useCallback((anchorKey?: string | null, scrollContainerRef?: React.RefObject<HTMLDivElement | null>) => {
    setVisibleCount(prev => Math.min(prev + PAGE_SIZE, processedData.length));
    
    if (anchorKey && scrollContainerRef?.current) {
      const root = scrollContainerRef.current;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          for (const el of root.querySelectorAll<HTMLElement>("tbody tr[data-table-row-key]")) {
            if (el.getAttribute("data-table-row-key") === anchorKey) {
              el.scrollIntoView({ behavior: "smooth", block: "start" });
              break;
            }
          }
        });
      });
    }
  }, [processedData.length]);

  // Reset/update page size when filter, sort, or data length changes
  useEffect(() => {
    if (alwaysShowAll) {
      setVisibleCount(Math.min(20, processedData.length));
      const handle = requestAnimationFrame(() => {
        setVisibleCount(processedData.length);
      });
      return () => cancelAnimationFrame(handle);
    } else {
      setVisibleCount(PAGE_SIZE);
    }
  }, [filter, activeSortColumn, activeSortDirection, processedData.length, alwaysShowAll]);

  // Reset selection on project or data change
  useEffect(() => {
    exitMassSelect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return {
    searchQuery,
    setSearchQuery,
    selectedIds,
    setSelectedIds,
    massSelectMode,
    setMassSelectMode,
    toggleRowSelected,
    exitMassSelect,
    rowContentTypes,
    setRowContentType,
    counts,
    handleSortToggle,
    activeSortColumn,
    activeSortDirection,
    processedData,
    displayedData,
    hasMore,
    remaining,
    loadMore,
  };
}
