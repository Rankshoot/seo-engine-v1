"use client";

/**
 * Developer / debug mode gate.
 *
 * ─── Best-practice production pattern ─────────────────────────────────────
 * There are three common approaches teams use in production:
 *
 * 1. URL query trigger + localStorage persistence (what we use here)
 *    Add `?d` to any page URL once. The flag is stored in localStorage so it
 *    survives navigation. Clear it by visiting `?d=off`. Simple, zero backend.
 *
 * 2. Build-time env var (`NEXT_PUBLIC_DEVELOPER_TOOLS=true`)
 *    Bake it into the build. Perfect for staging/preview environments — dev
 *    mode is always on without touching URLs. Zero runtime cost.
 *
 * 3. Hidden keyboard shortcut (e.g. Shift+D pressed 3× within 1 s)
 *    No URL pollution, works in demos. Slightly harder to document.
 *
 * We implement both (1) and (2). Use (2) for staging, (1) for ad-hoc prod
 * debugging without redeploying.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useSyncExternalStore } from "react";

export const DEVELOPER_MODE_STORAGE_KEY = "seo_engine_developer_mode";

/** Build-time: set `NEXT_PUBLIC_DEVELOPER_TOOLS=true` to always enable developer UI. */
export function isDeveloperToolsEnvEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEVELOPER_TOOLS === "true";
}

export function useDeveloperMode(): {
  developerMode: boolean;
  setDeveloperMode: (v: boolean) => void;
  forcedByEnv: boolean;
} {
  const forcedByEnv = isDeveloperToolsEnvEnabled();

  const storedOn = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => {};
      window.addEventListener("storage", onStoreChange);
      window.addEventListener("popstate", onStoreChange);
      window.addEventListener("developer-mode-change", onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener("popstate", onStoreChange);
        window.removeEventListener("developer-mode-change", onStoreChange);
      };
    },
    () => {
      if (typeof window === "undefined") return false;
      try {
        const q = new URLSearchParams(window.location.search);
        // ?d  →  activate   |   ?d=off  →  deactivate
        if (q.has("d") && q.get("d") !== "off") {
          localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, "1");
          return true;
        }
        if (q.get("d") === "off") {
          localStorage.removeItem(DEVELOPER_MODE_STORAGE_KEY);
          return false;
        }
        return localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY) === "1";
      } catch {
        return false;
      }
    },
    () => false
  );

  const setDeveloperMode = useCallback(
    (v: boolean) => {
      if (forcedByEnv) return;
      try {
        if (v) localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, "1");
        else localStorage.removeItem(DEVELOPER_MODE_STORAGE_KEY);
        window.dispatchEvent(new Event("developer-mode-change"));
      } catch {
        /* ignore */
      }
    },
    [forcedByEnv]
  );

  return {
    developerMode: forcedByEnv || storedOn,
    setDeveloperMode,
    forcedByEnv,
  };
}
