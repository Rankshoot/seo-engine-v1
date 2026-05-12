"use client";

import { useCallback, useEffect, useState } from "react";

export const DEVELOPER_MODE_STORAGE_KEY = "seo_engine_developer_mode";

/** Build-time: set `NEXT_PUBLIC_DEVELOPER_TOOLS=true` to always show developer-only UI (e.g. raw scrape). */
export function isDeveloperToolsEnvEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEVELOPER_TOOLS === "true";
}

export function useDeveloperMode(): {
  developerMode: boolean;
  setDeveloperMode: (v: boolean) => void;
  forcedByEnv: boolean;
} {
  const forcedByEnv = isDeveloperToolsEnvEnabled();
  const [storedOn, setStoredOn] = useState(false);

  useEffect(() => {
    if (forcedByEnv || typeof window === "undefined") return;
    try {
      const q = new URLSearchParams(window.location.search);
      if (q.get("dev") === "1" || q.get("developer") === "1") {
        localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, "1");
        setStoredOn(true);
        return;
      }
    } catch {
      /* ignore */
    }
    try {
      if (localStorage.getItem(DEVELOPER_MODE_STORAGE_KEY) === "1") setStoredOn(true);
    } catch {
      /* ignore */
    }
  }, [forcedByEnv]);

  const setDeveloperMode = useCallback(
    (v: boolean) => {
      if (forcedByEnv) return;
      setStoredOn(v);
      try {
        if (v) localStorage.setItem(DEVELOPER_MODE_STORAGE_KEY, "1");
        else localStorage.removeItem(DEVELOPER_MODE_STORAGE_KEY);
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
