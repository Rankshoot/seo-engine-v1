"use client";

import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useNotify } from "@/hooks/useNotify";
import { qk } from "@/lib/query";
import { registerServiceWorker } from "@/lib/web-push-client";
import { getActiveProjectTasks, getProjectTaskOutcome } from "@/app/actions/task-actions";

type TaskCopy = { title: string; body?: string; href?: string };

/**
 * Per-job-type notification rendering. Adding a new long-running job type is a
 * single entry here — no new watcher, no new poll loop. `success` receives the
 * job's stored `result` so it can build the final copy + deep link.
 */
const TASK_CONFIG: Record<
  string,
  {
    running: (label: string) => TaskCopy;
    success: (projectId: string, result: Record<string, unknown>, label: string) => TaskCopy;
    errorTitle: string;
    invalidate?: (projectId: string) => QueryKey[];
  }
> = {
  blog_generate: {
    running: (l) => ({ title: "Generating blog…", body: l || undefined }),
    success: (pid, r, l) => ({
      title: "Blog ready",
      body: l || undefined,
      href: typeof r.blogId === "string" ? `/projects/${pid}/content-generator/blogs/${r.blogId}` : undefined,
    }),
    errorTitle: "Blog generation failed",
    invalidate: (pid) => [qk.contentStudioHistory(pid), qk.calendarWithBlogs(pid), qk.projectStats(pid)],
  },
  content_audit: {
    running: (l) => ({ title: "Auditing content…", body: l || undefined }),
    success: (pid, r, l) => ({
      title: r.persisted ? "Content audit ready" : "Audit finished",
      body: typeof r.warning === "string" && r.warning ? r.warning : l || undefined,
      href: `/projects/${pid}/audit`,
    }),
    errorTitle: "Content audit failed",
    invalidate: (pid) => [["audit-coverage", pid]],
  },
};

const DEFAULT_CONFIG = {
  running: (l: string) => ({ title: "Working…", body: l || undefined }) as TaskCopy,
  success: (_pid: string, _r: Record<string, unknown>, l: string) =>
    ({ title: "Task complete", body: l || undefined }) as TaskCopy,
  errorTitle: "A task failed",
  invalidate: undefined as ((pid: string) => QueryKey[]) | undefined,
};

/**
 * One watcher for EVERY long-running background job in a project — content
 * generation, single-content audits, and (aggregated) full-site scans. Mounted
 * once in the project shell so it tracks work wherever the user navigates and
 * re-attaches after a refresh. A single poll → single query drives the whole
 * notification center. Replaces the blog-only watcher.
 *
 * Site scans are chunked into many `site_audit_scan` jobs; those are collapsed
 * into ONE "Scanning your site…" notification rather than one per batch.
 */
export function TaskNotificationWatcher({ projectId }: { projectId: string }) {
  const notify = useNotify();
  const queryClient = useQueryClient();
  const seenRef = useRef<Map<string, { type: string; label: string }>>(new Map());
  const siteScanActiveRef = useRef(false);

  // Make sure the service worker is registered whenever the app is open and
  // notifications are allowed, so OS notifications fire via the reliable
  // `registration.showNotification()` path (not the flaky legacy constructor).
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      void registerServiceWorker();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    seenRef.current = new Map();
    siteScanActiveRef.current = false;

    const tick = async () => {
      try {
        const res = await getActiveProjectTasks(projectId);
        if (cancelled) return;
        if (res.success) {
          const scanJobs = res.tasks.filter((t) => t.type === "site_audit_scan");
          const perJob = res.tasks.filter((t) => t.type !== "site_audit_scan");
          const current = new Map(perJob.map((t) => [t.jobId, { type: t.type, label: t.label }]));

          // Newly-seen per-job tasks → "running" (covers resume-after-refresh).
          for (const [jobId, meta] of current) {
            if (!seenRef.current.has(jobId)) {
              const cfg = TASK_CONFIG[meta.type] ?? DEFAULT_CONFIG;
              const c = cfg.running(meta.label);
              notify({ key: `task:${jobId}`, status: "running", title: c.title, body: c.body, projectId, os: false });
            }
          }

          // Tasks that were active and are now gone → fetch outcome, notify.
          for (const [jobId, meta] of seenRef.current) {
            if (!current.has(jobId)) {
              const outcome = await getProjectTaskOutcome(projectId, jobId);
              if (cancelled) return;
              const cfg = TASK_CONFIG[outcome.type || meta.type] ?? DEFAULT_CONFIG;
              const label = outcome.label || meta.label;
              if (outcome.status === "done") {
                const c = cfg.success(projectId, outcome.result, label);
                notify({ key: `task:${jobId}`, status: "success", title: c.title, body: c.body, href: c.href, projectId, os: true });
                for (const k of cfg.invalidate?.(projectId) ?? []) {
                  void queryClient.invalidateQueries({ queryKey: k });
                }
              } else if (outcome.status === "failed") {
                notify({
                  key: `task:${jobId}`,
                  status: "error",
                  title: cfg.errorTitle,
                  body: outcome.error || label || undefined,
                  projectId,
                  os: true,
                });
              }
            }
          }
          seenRef.current = current;

          // Aggregated full-site scan (many chunk jobs → one notification).
          const scanActive = scanJobs.length > 0;
          if (scanActive && !siteScanActiveRef.current) {
            notify({
              key: `task:sitescan:${projectId}`,
              status: "running",
              title: "Scanning your site…",
              body: `${scanJobs.length} batch${scanJobs.length === 1 ? "" : "es"} in progress`,
              projectId,
              os: false,
            });
          } else if (!scanActive && siteScanActiveRef.current) {
            notify({
              key: `task:sitescan:${projectId}`,
              status: "success",
              title: "Site scan complete",
              href: `/projects/${projectId}/audit`,
              projectId,
              os: true,
            });
            void queryClient.invalidateQueries({ queryKey: ["audit-coverage", projectId] });
          }
          siteScanActiveRef.current = scanActive;
        }
      } catch {
        // transient — retried on the next tick
      }
      if (cancelled) return;
      const busy = seenRef.current.size > 0 || siteScanActiveRef.current;
      timer = setTimeout(() => void tick(), busy ? 4000 : 15000);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, notify, queryClient]);

  return null;
}
