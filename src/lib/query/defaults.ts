/** Shared TanStack Query timing (used by `QueryProvider` and per-feature hooks). */
export const QUERY_STALE_MS = 30 * 60 * 1000;
export const QUERY_GC_MS = 60 * 60 * 1000;

/** Admin dashboards refresh more often than project data. */
export const ADMIN_QUERY_STALE_MS = 5 * 60 * 1000;

export const DEFAULT_QUERY_OPTIONS = {
  staleTime: QUERY_STALE_MS,
  gcTime: QUERY_GC_MS,
  refetchOnMount: false as const,
  refetchOnWindowFocus: false as const,
};

export const ADMIN_QUERY_OPTIONS = {
  staleTime: ADMIN_QUERY_STALE_MS,
  gcTime: QUERY_GC_MS,
  refetchOnMount: false as const,
  refetchOnWindowFocus: false as const,
};
