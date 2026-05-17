"use client";

import { useEffect, useState } from "react";

/**
 * Subscribe to a CSS media query. Returns `false` during SSR / first paint
 * so layouts stay deterministic.
 *
 *   const isDesktop = useMediaQuery("(min-width: 1024px)");
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const mql = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mql.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
