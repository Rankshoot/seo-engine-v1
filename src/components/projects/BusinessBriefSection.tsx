"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { qk, useBusinessBrief } from "@/lib/query";
import type { BusinessBrief } from "@/lib/business-brief";
import { briefApi } from "@/frontend/api/brief";
import { BusinessBriefSkeleton } from "@/components/Skeleton";

type BriefResponse = Awaited<ReturnType<typeof briefApi.get>>;

export function BusinessBriefSection({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const BRIEF_KEY = qk.brief(projectId);
  const { data: briefData, isLoading: loadingBrief } = useBusinessBrief(projectId);
  const [briefOpen, setBriefOpen] = useState(false);
  const [refreshingBrief, setRefreshingBrief] = useState(false);
  const [briefError, setBriefError] = useState("");

  const brief: BusinessBrief | null =
    briefData && briefData.success ? briefData.brief ?? null : null;
  const briefUpdatedAt: string | null =
    briefData && briefData.success ? briefData.updated_at ?? null : null;

  const handleRefreshBrief = async () => {
    setRefreshingBrief(true);
    setBriefError("");
    const res = await briefApi.generate(projectId, { force: true });
    if (res.trace?.length) {
      console.groupCollapsed(
        `[Brief] Refresh — scraped ${res.trace.filter(t => t.label === "jina_read" && t.ok).length} pages`
      );
      for (const t of res.trace) {
        console.log(t.label, { url: t.url, ok: t.ok, length: t.length, error: t.error });
      }
      console.groupEnd();
    }
    if (res.success && res.brief) {
      const updatedAt = new Date().toISOString();
      queryClient.setQueryData<BriefResponse>(BRIEF_KEY, {
        success: true,
        brief: res.brief,
        updated_at: updatedAt,
      });
    } else {
      setBriefError(res.error ?? "Failed to refresh business brief");
    }
    setRefreshingBrief(false);
  };

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-[28px] font-normal tracking-[-0.28px] text-text-primary font-display">Business brief</h2>
        <p className="mt-1.5 text-[14px] text-text-tertiary max-w-3xl">
          Scraped context from your domain that seeds keyword discovery — refresh when your site or positioning changes.
        </p>
      </div>
      {briefError ? (
        <div className="rounded-[16px] border border-brand-coral/20 bg-brand-coral/10 p-4 text-[14px] text-brand-coral">
          {briefError}
        </div>
      ) : null}
      {loadingBrief ? (
        <BusinessBriefSkeleton />
      ) : (
        <div className="rounded-[16px] border border-border-subtle bg-surface-elevated p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-surface-tertiary text-text-primary">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008H17.25v-.008Zm0 3h.008v.008H17.25v-.008Zm0 3h.008v.008H17.25v-.008Z" />
                </svg>
              </div>
              <div>
                {brief ? (
                  <p className="text-[13px] text-text-tertiary">
                    {brief.seed_phrases.length} seeds · scraped {brief.source_urls.length} pages
                    {briefUpdatedAt
                      ? ` · updated ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(briefUpdatedAt))}`
                      : ""}
                  </p>
                ) : (
                  <p className="text-[13px] text-text-tertiary">
                    No brief yet — we&apos;ll auto-build one on your first Discover run from Keywords.
                  </p>
                )}
                {brief?.summary ? (
                  <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-text-secondary line-clamp-2">
                    {brief.summary}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {brief ? (
                <button
                  type="button"
                  onClick={() => setBriefOpen(o => !o)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,colors] duration-200 hover:border-border-strong hover:text-text-primary hover:-translate-y-px active:scale-95"
                >
                  {briefOpen ? "Hide details" : "View details"}
                </button>
              ) : null}
              <div className="flex flex-col items-end gap-0.5">
                <button
                  type="button"
                  onClick={handleRefreshBrief}
                  disabled={refreshingBrief}
                  title="Re-scrape your domain and regenerate the business brief. Uses Jina Reader."
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,colors] duration-200 hover:border-border-strong hover:text-text-primary hover:-translate-y-px active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                >
                  {refreshingBrief ? (
                    <>
                      <div className="h-3 w-3 animate-spin rounded-full border-2 border-text-tertiary border-t-text-primary" />
                      Scraping…
                    </>
                  ) : (
                    <>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                        />
                      </svg>
                      {brief ? "Refresh brief" : "Generate brief"}
                    </>
                  )}
                </button>
                {briefUpdatedAt && (
                  <span className="text-[10px] text-text-tertiary" title={briefUpdatedAt}>
                    Updated{" "}
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(briefUpdatedAt))}
                  </span>
                )}
              </div>
            </div>
          </div>

          {briefOpen && brief ? (
            <div className="mt-6 grid grid-cols-1 gap-6 border-t border-border-subtle pt-6 md:grid-cols-2">
              {brief.products.length ? (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Products</p>
                  <div className="flex flex-wrap gap-2">
                    {brief.products.map(p => (
                      <span key={p} className="rounded-[4px] bg-surface-secondary px-2.5 py-1 text-[13px] text-text-secondary">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {brief.entities.length ? (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Entities</p>
                  <div className="flex flex-wrap gap-2">
                    {brief.entities.slice(0, 18).map(e => (
                      <span key={e} className="rounded-[4px] bg-surface-secondary px-2.5 py-1 text-[13px] text-text-secondary">
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {brief.audiences.length ? (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Audiences</p>
                  <ul className="space-y-1 text-[13px] text-text-secondary">
                    {brief.audiences.map(a => (
                      <li key={a}>· {a}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {brief.usps.length ? (
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">USPs</p>
                  <ul className="space-y-1 text-[13px] text-text-secondary">
                    {brief.usps.map(u => (
                      <li key={u}>· {u}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {brief.seed_phrases.length ? (
                <div className="md:col-span-2">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
                    Seed phrases ({brief.seed_phrases.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {brief.seed_phrases.map(s => (
                      <span
                        key={s}
                        className="rounded-[4px] border border-brand-action/20 bg-brand-action/10 px-2.5 py-1 text-[13px] text-brand-action"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {brief.source_urls.length ? (
                <div className="md:col-span-2">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-text-tertiary">Scraped pages</p>
                  <ul className="space-y-1 text-[13px]">
                    {brief.source_urls.map(u => (
                      <li key={u} className="truncate">
                        <a href={u} target="_blank" rel="noopener noreferrer" className="text-brand-action hover:underline">
                          {u}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
