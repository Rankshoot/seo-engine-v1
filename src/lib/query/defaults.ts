/** Shared TanStack Query timing (used by `QueryProvider` and per-feature hooks). */
export const QUERY_STALE_MS = 30 * 60 * 1000;
export const QUERY_GC_MS = 60 * 60 * 1000;

export const DEFAULT_QUERY_OPTIONS = {
  staleTime: QUERY_STALE_MS,
  gcTime: QUERY_GC_MS,
  refetchOnMount: false as const,
  refetchOnWindowFocus: false as const,
};
