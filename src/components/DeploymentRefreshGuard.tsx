"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Keeps every open tab on the LATEST deployed version without the user ever
 * needing a hard refresh.
 *
 * How: the client bundle carries the deployment's buildId inlined
 * (NEXT_PUBLIC_BUILD_ID, see next.config.ts). This guard periodically asks
 * `/api/version` which build the server is running. When they differ, a new
 * deploy has shipped and this tab is stale — it then reloads itself at the
 * SAFEST possible moment:
 *
 *   1. On the next route navigation (the page is being torn down anyway —
 *      completely invisible to the user).
 *   2. When the tab becomes visible again after being hidden for 30+ minutes
 *      (a long-idle tab; nothing in-flight the user could lose).
 *   3. Immediately when a lazy chunk fails to load (the classic stale-deploy
 *      crash: old HTML asking for hashed JS files that no longer exist) —
 *      one-shot guarded so it can never reload-loop.
 *
 * It deliberately NEVER reloads under the user mid-page (unsaved blog edits,
 * running generations, open modals stay untouched).
 */

const CHECK_INTERVAL_MS = 5 * 60_000; // steady-state poll
const IDLE_RELOAD_AFTER_MS = 30 * 60_000; // hidden-tab age that makes an instant reload safe
const CHUNK_RELOAD_GUARD_KEY = "rs-chunk-reload-at";

function isChunkLoadFailure(message: string): boolean {
  return /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i.test(
    message
  );
}

/** Reload once per 30s window at most — a stale tab must never reload-loop. */
function reloadOnceGuarded() {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    /* sessionStorage unavailable — still reload, just unguarded */
  }
  window.location.reload();
}

export function DeploymentRefreshGuard() {
  const pathname = usePathname();
  const staleRef = useRef(false);
  const hiddenSinceRef = useRef<number | null>(null);
  const ownBuildId = process.env.NEXT_PUBLIC_BUILD_ID;
  const enabled = process.env.NODE_ENV === "production" && Boolean(ownBuildId);

  // 1. Reload on route change once we know we're stale. Runs BEFORE paint of
  // the new route's content settles; the destination then loads fresh.
  useEffect(() => {
    if (enabled && staleRef.current) {
      window.location.reload();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        if (!cancelled && data.buildId && data.buildId !== "dev" && data.buildId !== ownBuildId) {
          staleRef.current = true;
        }
      } catch {
        /* offline / transient — try again next tick */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenSinceRef.current = Date.now();
        return;
      }
      // Tab became visible again.
      const hiddenFor = hiddenSinceRef.current ? Date.now() - hiddenSinceRef.current : 0;
      hiddenSinceRef.current = null;
      if (staleRef.current && hiddenFor >= IDLE_RELOAD_AFTER_MS) {
        reloadOnceGuarded();
        return;
      }
      void check();
    };

    // 3. Stale-deploy crash safety net: a missing hashed chunk means this tab
    // is running dead code — recover transparently instead of showing a
    // broken screen.
    const onError = (event: ErrorEvent) => {
      const msg = `${event.message ?? ""} ${(event.error as Error | undefined)?.message ?? ""}`;
      if (isChunkLoadFailure(msg)) reloadOnceGuarded();
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { name?: string; message?: string } | undefined;
      const msg = `${reason?.name ?? ""} ${reason?.message ?? ""}`;
      if (isChunkLoadFailure(msg)) reloadOnceGuarded();
    };

    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    // First check shortly after load (not immediately — keep startup light).
    const kickoff = window.setTimeout(check, 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.clearTimeout(kickoff);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [enabled, ownBuildId]);

  return null;
}
