"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { Button, EmptyState } from "@/components/common";
import {
  ContentTypeBadge,
} from "@/components/content-generator/shared";
import { TableSkeleton } from "@/components/Skeleton";
import { contentGeneratorApi, type ContentStudioHistoryRow } from "@/frontend/api/content-generator";
import { qk, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import { CONTENT_TYPE_LABEL, CONTENT_TYPE_PLURAL, type ContentType } from "@/lib/types";
import { cn } from "@/lib/cn";
import { getContentPreviewUrl } from "@/lib/content-routing";
import { calendarApi } from "@/frontend/api/calendar";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";
import { unscheduleContentAction } from "@/app/actions/content-actions";
import toast from "react-hot-toast";

type SortKey = "updated" | "created" | "words" | "title";
type TypeFilter = ContentType | "all";

const TYPE_FILTERS: ContentType[] = ["blog", "ebook", "whitepaper", "linkedin", "landing_page"];
const TYPE_FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "blog", label: "Blogs" },
  { value: "ebook", label: "Ebooks" },
  { value: "whitepaper", label: "Whitepapers" },
  { value: "linkedin", label: "LinkedIn posts" },
  { value: "landing_page", label: "Landing Pages" },
];
const PAGE_SIZE = 20;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusTone(status: string): string {
  if (status === "published") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  if (status === "approved") return "border-brand-action/30 bg-brand-action/10 text-brand-action";
  return "border-border-subtle bg-surface-secondary text-text-secondary";
}

interface HistoryRowProps {
  row: ContentStudioHistoryRow;
  index: number;
  viewerHref: (row: ContentStudioHistoryRow) => string;
  calendarEntries: any[];
  scheduledDatesSet: Set<string>;
  savingRowId: string | null;
  onScheduleConfirm: (row: ContentStudioHistoryRow, date: string) => Promise<void>;
  onUnschedule: (row: ContentStudioHistoryRow) => Promise<void>;
}

const HistoryRow = memo(function HistoryRow({
  row,
  index,
  viewerHref,
  calendarEntries,
  scheduledDatesSet,
  savingRowId,
  onScheduleConfirm,
  onUnschedule,
}: HistoryRowProps) {
  const [open, setOpen] = useState(false);

  const currentDate = useMemo(() => {
    if (!row.entry_id || !calendarEntries) return null;
    const hit = calendarEntries.find((e) => e.id === row.entry_id);
    return hit ? hit.scheduled_date : null;
  }, [row.entry_id, calendarEntries]);

  const nextVacantDate = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    
    for (let i = 0; i < 500; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!scheduledDatesSet.has(key)) {
        return key;
      }
    }
    return null;
  }, [scheduledDatesSet]);

  return (
    <tr className="hover:bg-surface-hover/50 transition-colors">
      <td className="px-3 py-2.5 align-middle text-center text-[12px] font-mono text-text-tertiary tabular-nums">
        {index}
      </td>
      <td className="px-4 py-2.5 align-middle">
        <ContentTypeBadge type={CONTENT_TYPE_LABEL[row.content_type]} />
      </td>
      <td className="px-4 py-2.5 align-middle min-w-0 max-w-[min(28rem,40vw)]">
        <ProjectNavLink
          href={viewerHref(row)}
          className="block truncate text-[13px] font-medium text-text-primary hover:text-brand-action transition-colors"
          title={row.title}
        >
          {row.title}
        </ProjectNavLink>
        {row.meta_description ? (
          <p className="mt-0.5 truncate text-[11px] text-text-tertiary" title={row.meta_description}>
            {row.meta_description}
          </p>
        ) : null}
      </td>
      <td className="px-4 py-2.5 align-middle min-w-0 max-w-[min(20rem,30vw)]">
        <p className="truncate text-[12px] text-text-secondary" title={row.target_keyword}>
          {row.target_keyword || "—"}
        </p>
      </td>
      <td className="px-4 py-2.5 align-middle">
        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
            statusTone(row.status),
          )}
        >
          {row.status}
        </span>
      </td>
      <td className="px-4 py-2.5 align-middle text-[12px] tabular-nums text-text-secondary">
        {row.word_count.toLocaleString()}
      </td>
      <td className="px-4 py-2.5 align-middle">
        {row.entry_id ? (
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="text-[12.5px] font-medium text-text-secondary">
              {currentDate ? fmtDate(currentDate) : "—"}
            </span>
            <CalendarDatePicker
              open={open}
              onOpenChange={setOpen}
              currentDate={currentDate}
              onConfirm={(date) => onScheduleConfirm(row, date)}
              onUnschedule={() => onUnschedule(row)}
              saving={savingRowId === row.id}
              scheduledDates={scheduledDatesSet}
              variant="change"
              iconOnly={true}
            />
          </div>
        ) : (
          <CalendarDatePicker
            open={open}
            onOpenChange={setOpen}
            currentDate={nextVacantDate}
            onConfirm={(date) => onScheduleConfirm(row, date)}
            saving={savingRowId === row.id}
            scheduledDates={scheduledDatesSet}
            variant="pick"
            label="Schedule"
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded-full px-3.5 py-1.5 text-[12px] font-medium transition-colors border h-auto",
              open
                ? "border-brand-action/40 bg-brand-action/10 text-brand-action"
                : "border-border-strong bg-surface-primary text-text-primary hover:bg-surface-hover hover:bg-surface-hover/80"
            )}
          />
        )}
      </td>
      <td className="px-4 py-2.5 align-middle text-right">
        <div className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
          <ProjectNavLink
            href={viewerHref(row)}
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-text-primary px-4 py-1.5 text-[12px] font-medium text-surface-primary no-underline transition-opacity hover:opacity-90"
          >
            View
          </ProjectNavLink>
        </div>
      </td>
    </tr>
  );
});

interface HistoryTableBodyProps {
  rows: ContentStudioHistoryRow[];
  offset: number;
  viewerHref: (row: ContentStudioHistoryRow) => string;
  calendarEntries: any[];
  scheduledDatesSet: Set<string>;
  savingRowId: string | null;
  onScheduleConfirm: (row: ContentStudioHistoryRow, date: string) => Promise<void>;
  onUnschedule: (row: ContentStudioHistoryRow) => Promise<void>;
}

const HistoryTableBody = memo(function HistoryTableBody({
  rows,
  offset,
  viewerHref,
  calendarEntries,
  scheduledDatesSet,
  savingRowId,
  onScheduleConfirm,
  onUnschedule,
}: HistoryTableBodyProps) {
  return (
    <tbody className="divide-y divide-border-subtle">
      {rows.map((row, i) => (
        <HistoryRow
          key={row.id}
          row={row}
          index={offset + i + 1}
          viewerHref={viewerHref}
          calendarEntries={calendarEntries}
          scheduledDatesSet={scheduledDatesSet}
          savingRowId={savingRowId}
          onScheduleConfirm={onScheduleConfirm}
          onUnschedule={onUnschedule}
        />
      ))}
    </tbody>
  );
});

export function HistoryTab() {
  const { id: projectId } = useParams<{ id: string }>();
  const studioBase = `/projects/${projectId}/content-generator`;
  const queryClient = useQueryClient();

  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  // Load calendar entries to populate the CalendarDatePicker and avoid date collisions
  const { data: calendarData } = useQuery({
    queryKey: qk.calendarWithBlogs(projectId),
    queryFn: () => calendarApi.withBlogs(projectId),
    enabled: !!projectId,
  });
  const calendarEntries = useMemo(() => {
    if (!calendarData?.success) return [];
    return calendarData.data.map((e) => ({
      ...e,
      scheduled_date: String(e.scheduled_date).slice(0, 10),
    }));
  }, [calendarData]);

  const scheduledDatesSet = useMemo(() => {
    if (!calendarData?.success) return new Set<string>();
    return new Set(calendarData.data.map((e) => String(e.scheduled_date).slice(0, 10)));
  }, [calendarData]);

  const handleScheduleConfirm = async (row: ContentStudioHistoryRow, date: string) => {
    if (!projectId) return;
    setSavingRowId(row.id);
    try {
      const res = await calendarApi.scheduleExistingBlog(projectId, {
        blogId: row.id,
        targetDate: date,
      });
      if (res.success) {
        const niceDate = new Date(`${res.scheduled_date}T00:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        toast.success(res.rescheduled ? `Rescheduled for ${niceDate}` : `Scheduled for ${niceDate}`);
        void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
      } else {
        toast.error(res.error || "Could not schedule content");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not schedule content");
    } finally {
      setSavingRowId(null);
    }
  };

  const handleUnschedule = async (row: ContentStudioHistoryRow) => {
    if (!row.entry_id || !projectId) return;
    setSavingRowId(row.id);
    try {
      const res = await unscheduleContentAction(projectId, row.id, row.entry_id);
      if (res.success) {
        toast.success("Unscheduled successfully");
        void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
      } else {
        toast.error(res.error || "Could not unschedule content");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not unschedule content");
    } finally {
      setSavingRowId(null);
    }
  };

  const [activeType, setActiveType] = useState<TypeFilter>("all");
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!typeDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setTypeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [typeDropdownOpen]);
  const sort: SortKey = "updated";
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);

  // Debounce search keystrokes to run queries efficiently
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: [
      ...qk.contentStudioHistory(projectId),
      {
        types: activeType === "all" ? [] : [activeType],
        search: debouncedSearch,
        sort,
        page,
      },
    ],
    queryFn: () =>
      contentGeneratorApi.studioHistory(projectId, {
        types: activeType === "all" ? undefined : [activeType as ContentType],
        search: debouncedSearch,
        sort,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    enabled: !!projectId,
    placeholderData: (prev) => prev,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const allRows: ContentStudioHistoryRow[] = data?.success ? data.data : [];
  const totalCount = data?.success ? data.total : 0;
  const counts = data?.success ? data.counts : { blog: 0, ebook: 0, whitepaper: 0, linkedin: 0 };

  const handleTypeChange = (t: TypeFilter) => {
    setActiveType(t);
    setTypeDropdownOpen(false);
    setPage(1);
  };

  const viewerHref = useMemo(() => {
    return (row: ContentStudioHistoryRow): string => {
      const url = getContentPreviewUrl(projectId, row.id, row.content_type);
      return row.content_type === "blog" ? `${url}?from=content-history` : url;
    };
  }, [projectId]);

  const hasActiveFilters = activeType !== "all" || search.trim() !== "";
  const isEmptyStateForNoContent = totalCount === 0 && !hasActiveFilters;

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const fromRecord = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toRecord = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <div className="space-y-8 pb-16 max-w-full px-4 mx-auto">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Content type dropdown */}
        <div className="relative" ref={typeDropdownRef}>
          <button
            type="button"
            onClick={() => setTypeDropdownOpen(o => !o)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors",
              typeDropdownOpen
                ? "border-border-strong bg-surface-hover text-text-primary"
                : "border-border-subtle bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            <span>
              {TYPE_FILTER_OPTIONS.find(o => o.value === activeType)?.label ?? "All"}
            </span>
            {activeType !== "all" && (
              <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-surface-tertiary px-1 text-[10px] font-semibold text-text-tertiary">
                {activeType in counts ? (counts as Record<string, number>)[activeType] : 0}
              </span>
            )}
            <svg
              width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"
              className={cn("transition-transform duration-150", typeDropdownOpen && "rotate-180")}
            >
              <path d="M2 4.5L6 8.5L10 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          {typeDropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 z-20 min-w-[168px] rounded-xl border border-border-subtle bg-surface-elevated shadow-xl overflow-hidden">
              {TYPE_FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleTypeChange(opt.value)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-[13px] font-medium transition-colors text-left",
                    activeType === opt.value
                      ? "bg-surface-hover text-text-primary"
                      : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                  )}
                >
                  <span>{opt.label}</span>
                  {opt.value !== "all" && (
                    <span className="text-[11px] text-text-tertiary tabular-nums">
                      {(counts as Record<string, number>)[opt.value] ?? 0}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); }}
            placeholder="Search title, keyword, type…"
            className="h-9 w-[260px] rounded-full border border-border-subtle bg-surface-secondary px-4 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand-action focus:ring-1 focus:ring-brand-action/40"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>

      </div>

      {isLoading ? (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          <TableSkeleton rows={8} columns={6} />
        </div>
      ) : allRows.length === 0 ? (
        <EmptyState
          title={isEmptyStateForNoContent ? "No content generated yet" : "No assets match these filters"}
          body={
            isEmptyStateForNoContent
              ? "Open a studio above and generate your first piece — it'll show up here automatically."
              : "Try widening your filters or clearing the search to see more assets."
          }
          action={
            <ProjectNavLink href={studioBase}>
              <Button variant="primary" size="md" shape="pill">
                Open content studio
              </Button>
            </ProjectNavLink>
          }
        />
      ) : (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left border-collapse">
              <thead className="bg-surface-secondary text-[10px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
                <tr>
                  <th className="px-3 py-3 w-12 text-center">#</th>
                  <th className="px-4 py-3 w-32">Type</th>
                  <th className="px-4 py-3 min-w-[14rem]">Title</th>
                  <th className="px-4 py-3 min-w-[10rem]">Primary keyword</th>
                  <th className="px-4 py-3 w-28">Status</th>
                  <th className="px-4 py-3 w-24 whitespace-nowrap">Words</th>
                  <th className="px-4 py-3 w-28 whitespace-nowrap">Scheduled</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap w-[1%]">Actions</th>
                </tr>
              </thead>
              <HistoryTableBody
                rows={allRows}
                offset={(page - 1) * PAGE_SIZE}
                viewerHref={viewerHref}
                calendarEntries={calendarEntries}
                scheduledDatesSet={scheduledDatesSet}
                savingRowId={savingRowId}
                onScheduleConfirm={handleScheduleConfirm}
                onUnschedule={handleUnschedule}
              />
            </table>
          </div>

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-border-subtle bg-surface-secondary/20">
            <p className="text-[12px] text-text-tertiary tabular-nums">
              {totalCount === 0 ? "No results" : `Showing ${fromRecord}–${toRecord} of ${totalCount}`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className={cn(
                  "h-8 px-3 rounded-md text-[12px] font-medium border border-border-subtle transition-colors",
                  page <= 1
                    ? "opacity-40 cursor-not-allowed text-text-tertiary"
                    : "text-text-secondary bg-surface-secondary hover:bg-surface-hover hover:text-text-primary"
                )}
              >
                Previous
              </button>
              <span className="text-[12px] text-text-tertiary tabular-nums px-1">
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                className={cn(
                  "h-8 px-3 rounded-md text-[12px] font-medium border border-border-subtle transition-colors",
                  page >= totalPages
                    ? "opacity-40 cursor-not-allowed text-text-tertiary"
                    : "text-text-secondary bg-surface-secondary hover:bg-surface-hover hover:text-text-primary"
                )}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
