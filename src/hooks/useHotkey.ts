"use client";

import { useEffect } from "react";

/**
 * Register a keyboard shortcut for the lifetime of the component.
 * Supports `cmd+k`, `ctrl+/`, `shift+enter` etc. Matches case-insensitively.
 */
export function useHotkey(
  combo: string,
  handler: (event: KeyboardEvent) => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    const parts = combo
      .toLowerCase()
      .split("+")
      .map(p => p.trim());
    const needsCmd = parts.includes("cmd") || parts.includes("meta");
    const needsCtrl = parts.includes("ctrl");
    const needsShift = parts.includes("shift");
    const needsAlt = parts.includes("alt");
    const key = parts.filter(
      p => !["cmd", "meta", "ctrl", "shift", "alt"].includes(p),
    )[0];

    const onKeyDown = (event: KeyboardEvent) => {
      if (needsCmd && !(event.metaKey || event.ctrlKey)) return;
      if (needsCtrl && !event.ctrlKey) return;
      if (needsShift !== event.shiftKey) return;
      if (needsAlt !== event.altKey) return;
      if (key && event.key.toLowerCase() !== key) return;
      handler(event);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [combo, handler, enabled]);
}
