"use client";

import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { auditsApi } from "@/frontend/api/audits";
import { qk } from "@/lib/query";
import { useAppDispatch } from "@/lib/redux/hooks";
import { contentHealthAuditMarkStale } from "@/lib/redux/content-health-audit-slice";
import type { SitemapPage } from "@/app/actions/audit-actions";
import {
  CHPageShell,
  CHEmptyState,
  ScoreRing,
  SeverityChip,
  ErrorBanner,
  SuccessBanner,
  SkeletonRows,
  Spinner,
  healthScoreColor,
} from "../_shared/ch-ui";
import { criticalityFromScore } from "@/lib/audit-criticality";

const MAX_SELECT = 5;

export default function DiscoverPagesPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const [basePath, setBasePath] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [auditing, setAuditing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionOk, setActionOk] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sitemap-pages", projectId, basePath],
    queryFn: () => auditsApi.sitemapPages(projectId, basePath || undefined),
    enabled: Boolean(projectId),
    staleTime: 60_000,
  });

  const pages = data?.success ? data.pages : [];
  const basePaths = data?.success ? data.basePaths : [];
  const totalSitemap = data?.success ? data.total : 0;
  const listError = (!data?.success && (data as { error?: string } | undefined)?.error)
    ? (data as { error?: string }).error ?? ""
    : error ? String(error) : "";

  const toggle = useCallback((url: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(url)) { next.delete(url); return next; }
      if (next.size >= MAX_SELECT) return prev;
      next.add(url);
      return next;
    });
  }, []);

  const runSelected = async () => {
    if (!projectId || selected.size === 0) return;
    setAuditing(true); setActionError(""); setActionOk("");
    try {
      const res = await auditsApi.auditSelected(projectId, [...selected]);
      if (res.success) {
        setActionOk(`Audited ${res.audited} page${res.audited === 1 ? "" : "s"}.${res.failed ? ` ${res.failed} failed.` : ""}`);
        setSelected(new Set());
        await queryClient.invalidateQueries({ queryKey: qk.audits(projectId) });
        dispatch(contentHealthAuditMarkStale({ projectId }));
        await refetch();
      } else { setActionError(res.error ?? "Audit failed."); }
    } catch (e) { setActionError(e instanceof Error ? e.message : "Audit failed."); }
    finally { setAuditing(false); }
  };

  return (
    <CHPageShell
      title="Discover pages"
      subtitle={`Browse every URL in your live sitemap. Select up to ${MAX_SELECT} pages and run a full Content Health audit on demand — results appear on Site audit.`}
    >
      {/* ── alerts ──────────────────────────────────────────────────────── */}
      {(listError || actionError) && <ErrorBanner message={listError || actionError} />}
      {actionOk && <SuccessBanner message={actionOk} />}

      {/* ── toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-text-tertiary">Path prefix</span>
          <select
            value={basePath}
            onChange={e => { setBasePath(e.target.value); setSelected(new Set()); }}
            className="rounded-[10px] border border-border-subtle bg-surface-elevated px-3 py-2 text-[13px] text-text-primary min-w-[180px] focus:outline-none focus:border-brand-action/50"
          >
            <option value="">All paths ({totalSitemap || pages.length} URLs)</option>
            {basePaths.map(bp => (
              <option key={bp} value={bp}>{bp}</option>
            ))}
          </select>
        </div>

        <span className="text-[12px] text-text-tertiary">
          {pages.length} URL{pages.length === 1 ? "" : "s"}
          {selected.size > 0 && <> · <span className="text-brand-action font-medium">{selected.size} selected</span></>}
          {selected.size >= MAX_SELECT && <span className="text-amber-400"> (max)</span>}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-[12px] text-text-tertiary hover:text-text-primary transition-colors"
            >
              Clear selection
            </button>
          )}
          <button
            type="button"
            disabled={auditing || selected.size === 0}
            onClick={runSelected}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-brand-primary px-5 text-[13px] font-semibold text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {auditing
              ? <><Spinner size={14} className="border-brand-on-primary/30 border-t-brand-on-primary" /> Auditing…</>
              : <>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803a7.5 7.5 0 0 0 10.607 0z" /></svg>
                  Audit selected ({selected.size}/{MAX_SELECT})
                </>}
          </button>
        </div>
      </div>

      {/* ── page list ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <SkeletonRows count={8} />
      ) : pages.length === 0 ? (
        <CHEmptyState
          icon={<svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" /></svg>}
          title="No URLs found"
          body="No URLs match this filter. Try selecting a different path prefix or check that your sitemap is reachable."
        />
      ) : (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
          {/* header */}
          <div className="grid grid-cols-[2.5rem_1fr_6rem_5.5rem_4.5rem] gap-0 border-b border-border-subtle bg-surface-secondary px-4 py-2.5">
            <div />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">URL / Keyword</p>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Prefix</p>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Status</p>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Score</p>
          </div>

          <div className="max-h-[min(70vh,720px)] overflow-y-auto divide-y divide-border-subtle/60">
            {pages.map((p: SitemapPage) => {
              const isSel = selected.has(p.url);
              const disabled = !isSel && selected.size >= MAX_SELECT;
              const crit = p.healthScore != null
                ? criticalityFromScore(p.healthScore, "ok")
                : null;

              return (
                <label
                  key={p.url}
                  className={`grid grid-cols-[2.5rem_1fr_6rem_5.5rem_4.5rem] gap-0 px-4 py-3 items-center cursor-pointer transition-colors ${
                    isSel
                      ? "bg-brand-action/5 hover:bg-brand-action/8"
                      : disabled
                        ? "opacity-40 cursor-not-allowed"
                        : "hover:bg-surface-hover"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSel}
                    disabled={disabled}
                    onChange={() => toggle(p.url)}
                    className="w-4 h-4 rounded border-border-subtle accent-brand-action"
                  />

                  <div className="min-w-0 pr-4">
                    <a
                      href={p.url} target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="block truncate text-[13px] text-brand-action hover:underline"
                      title={p.url}
                    >
                      {p.url}
                    </a>
                    {p.primaryKeyword && (
                      <p className="mt-0.5 text-[11px] text-text-tertiary truncate">
                        <span className="text-text-secondary font-medium">KW:</span> {p.primaryKeyword}
                      </p>
                    )}
                  </div>

                  <span className="font-mono text-[11px] text-text-tertiary truncate">{p.basePath}</span>

                  <div>
                    {p.audited ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7"/></svg>
                        Audited
                      </span>
                    ) : (
                      <span className="text-[11px] text-text-tertiary/60">Pending</span>
                    )}
                    {crit && <div className="mt-1"><SeverityChip severity={crit} /></div>}
                  </div>

                  <div className="flex items-center justify-end">
                    {p.healthScore != null ? (
                      <ScoreRing score={p.healthScore} size={40} />
                    ) : (
                      <span className="text-[12px] text-text-tertiary/50 tabular-nums">—</span>
                    )}
                  </div>
                </label>
              );
            })}
          </div>

          {/* footer count */}
          <div className="border-t border-border-subtle bg-surface-secondary px-4 py-2.5">
            <p className="text-[11px] text-text-tertiary">
              Showing {pages.length} of {totalSitemap} URLs
              {selected.size > 0 && ` · ${selected.size} selected`}
            </p>
          </div>
        </div>
      )}

      {/* ── tip ─────────────────────────────────────────────────────────── */}
      <p className="text-[12px] text-text-tertiary leading-relaxed">
        Select up to {MAX_SELECT} URLs and click <strong className="text-text-secondary">Audit selected</strong>. Results save to{" "}
        <ProjectNavLink href={`/projects/${projectId}/audit`} className="underline underline-offset-2 hover:text-text-primary transition-colors">Site audit</ProjectNavLink> instantly.
      </p>
    </CHPageShell>
  );
}
