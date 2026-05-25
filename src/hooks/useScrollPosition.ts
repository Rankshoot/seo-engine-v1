"use client";

import { useEffect, useState } from "react";

/**
 * Tiny scroll listener — returns true once the window has scrolled past the
 * given threshold. Used by the landing nav to switch from transparent to
 * blurred-glass styling.
 */
export function useScrolledPast(threshold = 24): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => setScrolled(window.scrollY > threshold);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [threshold]);

  return scrolled;
}
