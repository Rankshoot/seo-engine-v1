"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

/**
 * Lazily create the QueryClient inside a useState initializer so it survives
 * re-renders but is unique per browser tab. Creating it at module scope would
 * leak between server requests in some Next.js edge cases.
 */
function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data never goes stale on its own — navigating between sidebar pages
        // and switching browser tabs should NEVER trigger a background refetch.
        // Explicit invalidateQueries() calls (after mutations) are the only
        // mechanism that updates cached data.
        staleTime: Infinity,
        // Keep cached entries for 30 minutes of inactivity.
        gcTime: 30 * 60_000,
        // Don't re-fetch just because a component remounted (navigation).
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(makeClient);

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      )}
    </QueryClientProvider>
  );
}
