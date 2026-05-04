"use client";

/**
 * Project overview page — client component.
 *
 * `useQuery(qk.project(id))` shares the cache with `ProjectLayoutClient` (same
 * key); the first subscriber issues one `/api/v1` fetch. Calendar entries use
 * `qk.calendarWithBlogs` with long-lived cache (refetchOnMount: false).
 */

import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query";
import { calendarApi } from "@/frontend/api/calendar";
import { projectsApi } from "@/frontend/api/projects";
import type { CalendarEntryWithBlog, ProjectCompetitor } from "@/lib/types";
import { TARGET_REGIONS } from "@/lib/types";
import { SiteExplorerSection } from "@/components/projects/SiteExplorerSection";
import { BusinessBriefSection } from "@/components/projects/BusinessBriefSection";
import { Skeleton } from "@/components/Skeleton";

// ─── helpers ────────────────────────────────────────────────────────────────

function regionName(code: string): string {
  return TARGET_REGIONS.find(r => r.code === code.toLowerCase())?.name ?? code.toUpperCase();
}

function WorkflowIcon({ step }: { step: string }) {
  const cls = "w-5 h-5";
  switch (step) {
    case "keywords":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
      );
    case "competitors":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
        </svg>
      );
    case "audit":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case "calendar":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" />
        </svg>
      );
    default:
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><line x1="10" x2="8" y1="9" y2="9" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" />
        </svg>
      );
  }
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function ProjectOverviewPage() {
  const { id } = useParams<{ id: string }>();

  const { data: projectRes, isFetched: projectFetched } = useQuery({
    queryKey: qk.project(id),
    queryFn: () => projectsApi.get(id),
    enabled: !!id,
  });

  // Calendar entries: fetched once on first visit, then cached for the session.
  // Shared with the blogs page (same query key) so navigating between them is instant.
  const { data: calRes, isLoading: calLoading } = useQuery({
    queryKey: qk.calendarWithBlogs(id),
    queryFn: () => calendarApi.withBlogs(id),
    enabled: !!id,
  });

  const project = projectRes?.success ? projectRes.data : null;
  const recentEntries: CalendarEntryWithBlog[] = calRes?.success
    ? (calRes.data ?? []).slice(0, 5)
    : [];
  const userCompetitors = (project?.project_competitors ?? []) as ProjectCompetitor[];
  const target = project?.domain ?? "";

  if (!project) {
    if (!projectFetched) {
      return (
        <div className="space-y-10 pb-16 pl-4 pr-4">
          <div className="pt-4 pb-8 border-b border-border-subtle">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Skeleton className="h-6 w-28" rounded="full" />
              <Skeleton className="h-4 w-32" rounded="sm" />
            </div>
            <Skeleton className="h-[48px] w-80 max-w-full" rounded="lg" />
          </div>
          <Skeleton className="h-40 w-full rounded-[16px]" rounded="lg" />
        </div>
      );
    }
    return null;
  }

  return (
    <div className="space-y-10 pb-16 pl-4 pr-4">
      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div className="pt-4 pb-8 border-b border-border-subtle">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-[14px] text-text-tertiary">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-secondary px-3 py-1 font-mono text-[12px] uppercase tracking-widest text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-brand-action" />
            Site Explorer
          </span>
          <span className="font-mono text-text-primary">{target || project.domain}</span>
          <span className="opacity-30">/</span>
          <span>{regionName(project.target_region)}</span>
          {project.niche && (
            <>
              <span className="opacity-30">/</span>
              <span>{project.niche}</span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="text-[48px] font-normal tracking-[-0.96px] leading-none text-text-primary font-display">
              {project.name}
            </h1>
            {project.company && project.company !== project.name && (
              <p className="mt-3 text-[16px] text-text-tertiary">{project.company}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <ProjectNavLink
              href={`/projects/${id}/keywords`}
              className="rounded-[4px] px-4 py-2 text-[14px] text-text-secondary hover:text-text-primary hover:underline"
            >
              Keywords
            </ProjectNavLink>
            <ProjectNavLink
              href={`/projects/${id}/competitors`}
              className="rounded-[32px] bg-brand-primary px-5 py-2.5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
            >
              Competitors
            </ProjectNavLink>
          </div>
        </div>
      </div>

      <BusinessBriefSection projectId={id} />

      {/* ── AHREFS SITE EXPLORER (cached in DB + React Query, manual refresh only) ── */}
      <SiteExplorerSection projectId={id} />

      {/* ── UPCOMING CONTENT ───────────────────────────────────────────────── */}
      {calLoading ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-48" rounded="lg" />
            <Skeleton className="h-4 w-16" rounded="sm" />
          </div>
          <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`flex items-center gap-5 p-5 ${i > 0 ? "border-t border-border-subtle" : ""}`}>
                <Skeleton className="h-12 w-12 shrink-0" rounded="lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" rounded="sm" />
                  <Skeleton className="h-3 w-1/3" rounded="sm" />
                </div>
                <Skeleton className="h-6 w-20 shrink-0" rounded="sm" />
              </div>
            ))}
          </div>
        </section>
      ) : recentEntries.length > 0 ? (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[28px] font-normal tracking-[-0.28px] text-text-primary font-display">
              Upcoming content
            </h2>
            <ProjectNavLink
              href={`/projects/${id}/calendar`}
              className="text-[14px] font-medium text-brand-action hover:underline"
            >
              View all →
            </ProjectNavLink>
          </div>
          <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
            {recentEntries.map((entry, i) => {
              const date = new Date(entry.scheduled_date);
              const statusCls =
                entry.status === "generated"
                  ? "border-[#10b981]/30 bg-[#10b981]/10 text-[#10b981]"
                  : entry.status === "generating"
                  ? "border-[#f59e0b]/30 bg-[#f59e0b]/10 text-[#f59e0b]"
                  : "border-border-subtle bg-surface-secondary text-text-tertiary";
              const statusLabel =
                entry.status === "generated"
                  ? "Ready"
                  : entry.status === "generating"
                  ? "Generating…"
                  : "Scheduled";

              return (
                <div
                  key={entry.id}
                  className={`flex items-center gap-5 p-5 transition-colors hover:bg-surface-hover ${
                    i > 0 ? "border-t border-border-subtle" : ""
                  }`}
                >
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[8px] border border-border-subtle bg-surface-secondary">
                    <span className="text-[11px] font-bold uppercase leading-none text-text-tertiary">
                      {date.toLocaleDateString("en-US", { month: "short" })}
                    </span>
                    <span className="mt-1 text-[16px] font-medium leading-none text-text-primary">
                      {date.getDate()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[16px] font-medium text-text-primary">{entry.title}</p>
                    <p className="mt-1 text-[13px] text-text-tertiary">
                      {entry.focus_keyword} · {entry.article_type}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-[4px] border px-2.5 py-1 text-[11px] font-medium ${statusCls}`}
                  >
                    {statusLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ── PROJECT META ───────────────────────────────────────────────────── */}
      <section className="border-t border-border-subtle pt-8">
        <p className="mb-4 text-[13px] font-bold uppercase tracking-widest text-text-tertiary">
          Project setup
        </p>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {[
            { label: "Company",  value: project.company },
            { label: "Niche",    value: project.niche },
            { label: "Audience", value: project.target_audience },
            { label: "Domain",   value: target || project.domain, mono: true },
          ].map(f => (
            <div key={f.label}>
              <dt className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
                {f.label}
              </dt>
              <dd
                className={`mt-1.5 text-[14px] ${
                  f.mono ? "font-mono text-brand-action" : "text-text-secondary"
                }`}
              >
                {f.value}
              </dd>
            </div>
          ))}
          {userCompetitors.length > 0 && (
            <div className="col-span-2 md:col-span-4">
              <dt className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
                Saved Competitors
              </dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {userCompetitors.map(c => (
                  <span
                    key={c.id}
                    className="rounded-[4px] border border-border-subtle bg-surface-secondary px-2.5 py-1 font-mono text-[13px] text-text-secondary"
                  >
                    {c.domain}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
