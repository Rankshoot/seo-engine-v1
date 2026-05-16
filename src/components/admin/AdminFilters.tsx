"use client";

import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/common";
import { cn } from "@/lib/cn";

export interface AdminFiltersState {
  search: string;
  sort: string;
  sortDir: "asc" | "desc";
  userId?: string;
}

export function AdminFilters({
  searchPlaceholder = "Search…",
  sortOptions,
  state,
  onChange,
  extra,
}: {
  searchPlaceholder?: string;
  sortOptions: { value: string; label: string }[];
  state: AdminFiltersState;
  onChange: (next: AdminFiltersState) => void;
  extra?: React.ReactNode;
}) {
  const [searchDraft, setSearchDraft] = useState(state.search);

  useEffect(() => {
    setSearchDraft(state.search);
  }, [state.search]);

  const commitSearch = useCallback(() => {
    if (searchDraft !== state.search) {
      onChange({ ...state, search: searchDraft });
    }
  }, [onChange, searchDraft, state]);

  return (
    <div className="flex flex-col gap-3 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
            Search
          </label>
          <div className="flex gap-2">
            <Input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commitSearch()}
              placeholder={searchPlaceholder}
              className="h-9"
            />
            <button
              type="button"
              onClick={commitSearch}
              className="h-9 px-4 rounded-md border border-border-subtle bg-surface-elevated text-[13px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover shrink-0"
            >
              Apply
            </button>
          </div>
        </div>
        <div className="w-full lg:w-48">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
            Sort by
          </label>
          <select
            value={state.sort}
            onChange={(e) => onChange({ ...state, sort: e.target.value })}
            className={cn(
              "w-full h-9 rounded-md border border-border-subtle bg-surface-elevated px-3 text-[13px] text-text-primary",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-action/40"
            )}
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-full lg:w-36">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
            Direction
          </label>
          <select
            value={state.sortDir}
            onChange={(e) =>
              onChange({
                ...state,
                sortDir: e.target.value === "asc" ? "asc" : "desc",
              })
            }
            className={cn(
              "w-full h-9 rounded-md border border-border-subtle bg-surface-elevated px-3 text-[13px] text-text-primary",
              "focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-action/40"
            )}
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
        {extra}
      </div>
    </div>
  );
}
