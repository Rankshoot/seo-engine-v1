"use client";

import { useEffect, useState } from "react";

/**
 * Returns true after the component has hydrated on the client. Useful for
 * theme-aware children that would otherwise mismatch SSR markup.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
