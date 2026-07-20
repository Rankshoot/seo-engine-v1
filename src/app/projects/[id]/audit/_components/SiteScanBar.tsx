"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Radar, Loader2 } from "lucide-react";
import { getSiteAuditProgress } from "@/app/actions/site-audit-actions";
import { SiteScanModal } from "./SiteScanModal";

/**
 * "Scan your whole site" control. Opens a page-picker modal; once a scan is
 * running it polls progress until the background jobs finish, refreshing Audit
 * History as pages land. The scan lives on the server, so it keeps running (and
 * this bar resumes its "Scanning…" state) across a page refresh.
 */
export function SiteScanBar({
  projectId,
  onProgress,
}: {
  projectId: string;
  onProgress: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [scanned, setScanned] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const poll = useCallback(async () => {
    const res = await getSiteAuditProgress(projectId);
    if (!res.success) return;
    setActive(res.active);
    setScanned(res.scanned);
    onProgress();
    if (res.active === 0) stopPolling();
  }, [projectId, onProgress, stopPolling]);

  const ensurePolling = useCallback(() => {
    if (!pollRef.current) pollRef.current = setInterval(() => void poll(), 4000);
  }, [poll]);

  // Resume the "Scanning…" state if a scan is already running on the server
  // (e.g. after a page refresh), and poll until it finishes.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getSiteAuditProgress(projectId);
      if (cancelled || !res.success) return;
      setActive(res.active);
      setScanned(res.scanned);
      if (res.active > 0) ensurePolling();
    })();
    return () => { cancelled = true; stopPolling(); };
  }, [projectId, ensurePolling, stopPolling]);

  const onStarted = useCallback(() => {
    setActive(a => Math.max(a, 1));
    ensurePolling();
    void poll();
  }, [ensurePolling, poll]);

  const running = active > 0;

  return (
    <>
      <div className="mb-4 flex flex-col gap-2 rounded-[16px] border border-border-subtle bg-surface-elevated px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-primary">
            <Radar className="h-4 w-4 text-text-secondary" />
          </div>
          <div>
            <p className="text-[13px] font-medium text-text-primary">Scan your whole site</p>
            <p className="text-[12px] text-text-tertiary">
              Fast, free health check of the pages you choose (no AI credits used). Then run a deep audit on the weak ones.
            </p>
            {running && (
              <p className="mt-1 text-[12px] text-text-secondary">
                Scanning… {scanned} page{scanned === 1 ? "" : "s"} done · {active} batch{active === 1 ? "" : "es"} running
              </p>
            )}
          </div>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          disabled={running}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-primary px-4 py-2 text-[13px] font-semibold text-text-primary hover:bg-surface-secondary disabled:opacity-60"
        >
          {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {running ? "Scanning…" : "Scan all content"}
        </button>
      </div>

      <SiteScanModal
        projectId={projectId}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onStarted={onStarted}
      />
    </>
  );
}
