"use client";

import { useSyncExternalStore } from "react";

/**
 * Returns true after the component has hydrated on the client. Useful for
 * theme-aware children that would otherwise mismatch SSR markup.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}
