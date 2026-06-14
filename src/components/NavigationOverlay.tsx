"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// Module-level singleton — callable from any component without prop-drilling or context
let _trigger: (() => void) | null = null;

export function triggerPageTransition() {
  _trigger?.();
}

export function NavigationOverlay() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const prevPath = useRef(pathname);
  const fadeOutTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const unmountTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    _trigger = () => {
      clearTimeout(fadeOutTimer.current);
      clearTimeout(unmountTimer.current);
      setMounted(true);
      // Two RAF frames so the browser paints opacity:0 first, then transitions to 1
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
    };
    return () => { _trigger = null; };
  }, []);

  // Fade out when the route changes (new page has rendered)
  useEffect(() => {
    if (prevPath.current !== pathname && mounted) {
      setVisible(false);
      fadeOutTimer.current = setTimeout(() => setMounted(false), 220);
    }
    prevPath.current = pathname;
  }, [pathname, mounted]);

  if (!mounted) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[9000] pointer-events-none bg-surface-primary/50 backdrop-blur-[3px] transition-opacity duration-[180ms] ease-out ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    />
  );
}
