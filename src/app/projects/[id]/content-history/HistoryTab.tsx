"use client";

import { memo, useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import { Dialog } from "@/components/common/dialogs/Dialog";
import { deleteContentAssetAction, unscheduleContentAction } from "@/app/actions/content-actions";
import { getActiveProjectTasks } from "@/app/actions/task-actions";
import toast from "react-hot-toast";

type SortKey = "updated" | "created" | "words" | "title";
type TypeFilter = ContentType | "all";

const TYPE_FILTERS: ContentType[] = ["blog", "ebook", "whitepaper", "linkedin"];
const TYPE_FILTER_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "blog", label: "Blogs" },
  { value: "ebook", label: "Ebooks" },
  { value: "whitepaper", label: "Whitepapers" },
  { value: "linkedin", label: "LinkedIn posts" },
];
const PAGE_SIZE = 20;

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusTone(status: string): string {
  if (status === "published") return "border-status-success/30 bg-status-success/10 text-status-success";
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
  onDelete: (row: ContentStudioHistoryRow) => void;
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
  onDelete,
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
    <tr className="hover:bg-surface-hover/50 transition-colors animate-slide-up-bounce">
      <td className="px-3 py-2.5 align-middle text-center text-[12px] font-mono text-text-tertiary tabular-nums">
        {index}
      </td>
      <td className="px-4 py-2.5 align-middle">
        <ContentTypeBadge type={CONTENT_TYPE_LABEL[row.content_type] || row.content_type || "Blog"} />
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
          <button
            type="button"
            onClick={() => onDelete(row)}
            disabled={savingRowId === row.id}
            aria-label={`Delete ${row.title}`}
            className="inline-flex items-center justify-center gap-1 rounded-full border border-border-subtle/50 bg-transparent px-3 py-1 text-[11px] font-medium text-text-tertiary transition-colors hover:border-brand-coral/30 hover:bg-brand-coral/10 hover:text-brand-coral disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            title="Delete content"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
});

/**
 * A live placeholder row for a blog that is currently generating in the
 * background (durable job). Shows the topic/keyword the user entered plus a
 * "Generating…" affordance in place of View, so they can see exactly what's
 * being worked on. Swapped for the real row (in place, no refresh) when the job
 * finishes and the history query refetches.
 */
const GeneratingRow = memo(function GeneratingRow({ label }: { label: string }) {
  return (
    <tr className="bg-brand-action/[0.04] animate-slide-up-bounce">
      <td className="px-3 py-2.5 text-center align-middle">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-border-strong border-t-brand-action" />
      </td>
      <td className="px-4 py-2.5 align-middle">
        <ContentTypeBadge type="Blog" />
      </td>
      <td className="px-4 py-2.5 align-middle min-w-0 max-w-[min(28rem,40vw)]">
        <span className="block truncate text-[13px] font-medium text-text-primary" title={label}>
          {label || "Generating blog…"}
        </span>
        <div className="mt-1.5 h-2 w-2/3 rounded bg-surface-tertiary animate-pulse" />
      </td>
      <td className="px-4 py-2.5 align-middle">
        <div className="h-3 w-24 rounded bg-surface-tertiary animate-pulse" />
      </td>
      <td className="px-4 py-2.5 align-middle">
        <span className="inline-flex rounded-full border border-brand-action/30 bg-brand-action/10 px-2 py-0.5 text-[10px] font-semibold text-brand-action">
          generating
        </span>
      </td>
      <td className="px-4 py-2.5 align-middle">
        <div className="h-3 w-8 rounded bg-surface-tertiary animate-pulse" />
      </td>
      <td className="px-4 py-2.5 align-middle">
        <div className="h-3 w-16 rounded bg-surface-tertiary animate-pulse" />
      </td>
      <td className="px-4 py-2.5 align-middle text-right">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-action/30 bg-brand-action/10 px-4 py-1.5 text-[12px] font-medium text-brand-action whitespace-nowrap">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-action/40 border-t-brand-action" />
          Generating…
        </span>
      </td>
    </tr>
  );
});

const SkeletonRow = memo(function SkeletonRow() {
  return (
    <tr className="animate-pulse bg-surface-secondary/10">
      <td className="px-3 py-3.5 text-center align-middle">
        <div className="h-3 w-4 bg-surface-tertiary rounded mx-auto" />
      </td>
      <td className="px-4 py-3.5 align-middle">
        <div className="h-5.5 w-16 bg-surface-tertiary rounded-full" />
      </td>
      <td className="px-4 py-3.5 align-middle">
        <div className="h-4 w-3/4 bg-surface-tertiary rounded" />
        <div className="h-3 w-1/2 bg-surface-tertiary rounded mt-1.5" />
      </td>
      <td className="px-4 py-3.5 align-middle">
        <div className="h-4 w-24 bg-surface-tertiary rounded" />
      </td>
      <td className="px-4 py-3.5 align-middle">
        <div className="h-5.5 w-16 bg-surface-tertiary rounded-full" />
      </td>
      <td className="px-4 py-3.5 align-middle">
        <div className="h-4 w-10 bg-surface-tertiary rounded" />
      </td>
      <td className="px-4 py-3.5 align-middle">
        <div className="h-5.5 w-24 bg-surface-tertiary rounded-full" />
      </td>
      <td className="px-4 py-3.5 align-middle text-right">
        <div className="h-8.5 w-16 bg-surface-tertiary rounded-full ml-auto" />
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
  onDelete: (row: ContentStudioHistoryRow) => void;
  isLoadingMore?: boolean;
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
  onDelete,
  isLoadingMore,
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
          onDelete={onDelete}
        />
      ))}
      {isLoadingMore && (
        <>
          <SkeletonRow />
          <SkeletonRow />
        </>
      )}
    </tbody>
  );
});

export function HistoryTab() {
  const { id: projectId } = useParams<{ id: string }>();
  const studioBase = `/projects/${projectId}/content-generator`;
  const queryClient = useQueryClient();

  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<ContentStudioHistoryRow | null>(null);

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

  const handleDelete = useCallback((row: ContentStudioHistoryRow) => {
    setRowToDelete(row);
    setDeleteConfirmOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!rowToDelete || !projectId) return;
    setSavingRowId(rowToDelete.id);
    setDeleteConfirmOpen(false);
    try {
      const res = await deleteContentAssetAction(projectId, rowToDelete.id, rowToDelete.entry_id);
      if (res.success) {
        toast.success(`"${rowToDelete.title}" deleted`);
        setAllRows((prev) => prev.filter((r) => r.id !== rowToDelete.id));
        void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
      } else {
        toast.error(res.error || "Could not delete content");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete content");
    } finally {
      setSavingRowId(null);
      setRowToDelete(null);
    }
  }, [rowToDelete, projectId, queryClient]);

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

  const { data, isLoading, isFetching } = useQuery({
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

  const [allRows, setAllRows] = useState<ContentStudioHistoryRow[]>([]);

  // Reset page and clear rows when filters change
  useEffect(() => {
    setPage(1);
    setAllRows([]);
  }, [activeType, debouncedSearch]);

  // Accumulate pages of history rows
  useEffect(() => {
    if (data?.success) {
      if (page === 1) {
        setAllRows(data.data);
      } else {
        setAllRows((prev) => {
          const existingIds = new Set(prev.map((r) => r.id));
          const newRows = data.data.filter((r) => !existingIds.has(r.id));
          return [...prev, ...newRows];
        });
      }
    }
  }, [data, page]);

  // ── Live "generating" rows ──────────────────────────────────────────────────
  // Poll the durable background jobs so a blog queued from the generator shows as
  // a live row here, then swaps to the finished post in place when it completes.
  const { data: activeTasksData } = useQuery({
    queryKey: ["active-content-tasks", projectId],
    queryFn: () => getActiveProjectTasks(projectId),
    enabled: !!projectId,
    refetchInterval: (q) => {
      const tasks = (q.state.data as { tasks?: { type: string }[] } | undefined)?.tasks ?? [];
      return tasks.some((t) => t.type === "blog_generate") ? 4000 : 10000;
    },
    refetchOnWindowFocus: true,
  });
  const activeBlogJobs = useMemo(
    () => (activeTasksData?.tasks ?? []).filter((t) => t.type === "blog_generate"),
    [activeTasksData],
  );

  // When a job leaves the active set it just finished — refetch history so the
  // real row replaces its placeholder, and toast the user (useNotify only writes
  // to the bell, so the on-page toast is our responsibility).
  const prevJobIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const current = new Set(activeBlogJobs.map((j) => j.jobId));
    const completed = [...prevJobIdsRef.current].filter((id) => !current.has(id));
    if (completed.length > 0) {
      void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
      setPage(1);
      toast.success(completed.length === 1 ? "Your blog is ready" : `${completed.length} blogs are ready`);
    }
    prevJobIdsRef.current = current;
  }, [activeBlogJobs, projectId, queryClient]);

  const totalCount = data?.success ? data.total : 0;
  const counts = data?.success ? data.counts : { blog: 0, ebook: 0, whitepaper: 0, linkedin: 0 };
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const observerRef = useRef<IntersectionObserver | null>(null);
  const stateRef = useRef({ page, totalPages, isFetching });

  // Keep stateRef up to date on every render
  useEffect(() => {
    stateRef.current = { page, totalPages, isFetching };
  }, [page, totalPages, isFetching]);

  // Clean up observer on unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  // Use callback ref to handle conditional rendering of the sentinel element
  const loadMoreCallbackRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const { page: currentPage, totalPages: maxPages, isFetching: activeFetch } = stateRef.current;
        if (entries[0].isIntersecting && !activeFetch && currentPage < maxPages) {
          setPage((p) => p + 1);
        }
      },
      {
        threshold: 0,
        rootMargin: "150px",
      }
    );

    observer.observe(node);
    observerRef.current = observer;
  }, []);

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

  return (
    <div className="flex flex-col h-full gap-4 pb-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
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
        {/* Content type dropdown */}
        <div className="relative" ref={typeDropdownRef}>
          <button
            type="button"
            onClick={() => setTypeDropdownOpen(o => !o)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors",
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



      </div>

      {(isLoading || (allRows.length === 0 && isFetching)) && activeBlogJobs.length === 0 ? (
        <div className="flex-1 min-h-0 rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          <TableSkeleton rows={8} columns={6} />
        </div>
      ) : allRows.length === 0 && activeBlogJobs.length === 0 ? (
        <div className="flex-1 min-h-0">
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
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
            <table className="w-full min-w-[840px] text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-surface-secondary text-[10px] font-bold uppercase tracking-widest text-text-tertiary border-b border-border-subtle">
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
              {activeBlogJobs.length > 0 && (
                <tbody className="divide-y divide-border-subtle">
                  {activeBlogJobs.map((job) => (
                    <GeneratingRow key={job.jobId} label={job.label} />
                  ))}
                </tbody>
              )}
              <HistoryTableBody
                rows={allRows}
                offset={0}
                viewerHref={viewerHref}
                calendarEntries={calendarEntries}
                scheduledDatesSet={scheduledDatesSet}
                savingRowId={savingRowId}
                onScheduleConfirm={handleScheduleConfirm}
                onUnschedule={handleUnschedule}
                onDelete={handleDelete}
                isLoadingMore={isFetching && page > 1}
              />
            </table>
            {/* Sentinel element for infinite scroll */}
            <div ref={loadMoreCallbackRef} className="h-6" />
          </div>

          {/* Infinite Scroll Footer */}
          <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-3.5 border-t border-border-subtle bg-surface-secondary/20">
            <p className="text-[12px] text-text-tertiary tabular-nums">
              {totalCount === 0 ? "No results" : `Showing ${allRows.length} of ${totalCount} assets`}
            </p>
            {isFetching && page > 1 && (
              <div className="flex items-center gap-2 text-[12px] text-text-tertiary">
                <span className="w-3.5 h-3.5 animate-spin rounded-full border-[2px] border-border-subtle border-t-text-secondary" />
                <span>Loading more...</span>
              </div>
            )}
          </div>
        </div>
      )}

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        size="sm"
        title="Delete content"
        description={`Are you sure you want to delete "${rowToDelete?.title}"? The linked calendar entry will remain and the keyword will show Generate again.`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(false)}
              className="inline-flex items-center justify-center rounded-full border border-border-subtle bg-surface-secondary px-5 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={savingRowId !== null}
              className="inline-flex items-center justify-center rounded-full bg-brand-coral px-5 py-2 text-[13px] font-medium text-brand-on-coral transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {savingRowId ? "Deleting..." : "Delete"}
            </button>
          </>
        }
      >
        <></>
      </Dialog>
    </div>
  );
}
