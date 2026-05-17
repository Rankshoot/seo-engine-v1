"use client";

/**
 * Project overview page — client component.
 *
 * Pure presentation refresh — the React Query keys, server actions, and
 * cached fetches are unchanged. We just compose them through the new
 * design-system primitives (Logo glow, gradient stat strip, workflow rail).
 *
 * `useQuery(qk.project(id))` shares the cache with `ProjectLayoutClient`
 * (same key); the first subscriber issues one `/api/v1` fetch. Calendar
 * entries use `qk.calendarWithBlogs` with long-lived cache.
 */

import { useMemo } from "react";
import Link from "next/link";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query";
import { calendarApi } from "@/frontend/api/calendar";
import { projectsApi } from "@/frontend/api/projects";
import { auditsApi } from "@/frontend/api/audits";
import type { CalendarEntryWithBlog, ProjectCompetitor, CalendarStatus } from "@/lib/types";
import { TARGET_REGIONS } from "@/lib/types";
import { BusinessBriefSection } from "@/components/projects/BusinessBriefSection";
import { Skeleton } from "@/components/Skeleton";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { formatRelativeTime, formatShortDate, formatCompactNumber } from "@/utils/format";
import {
  Search,
  Target,
  Wand2,
  Activity,
  Calendar,
  FileText,
  ArrowRight,
  Sparkles,
  Globe2,
  Users,
  ExternalLink,
} from "lucide-react";

/* ───────── helpers ───────── */

function regionName(code: string): string {
  return TARGET_REGIONS.find(r => r.code === code.toLowerCase())?.name ?? code.toUpperCase();
}

type WorkflowStepKey = "discover" | "analyze" | "schedule" | "generate" | "publish";

const STATUS_TONE: Partial<Record<CalendarStatus, StatusTone>> = {
  scheduled: "neutral",
  generating: "warning",
  generated: "success",
  downloaded: "info",
  published: "violet",
  approved: "aqua",
};

const STATUS_LABEL: Record<CalendarStatus, string> = {
  scheduled: "Scheduled",
  generating: "Generating",
  generated: "Ready",
  downloaded: "Downloaded",
  published: "Published",
  approved: "Approved",
};

/* ───────── page ───────── */

export default function ProjectOverviewPage() {
  const { id } = useParams<{ id: string }>();

  const { data: projectRes, isFetched: projectFetched } = useQuery({
    queryKey: qk.project(id),
    queryFn: () => projectsApi.get(id),
    enabled: !!id,
  });

  const { data: statsRes } = useQuery({
    queryKey: qk.projectStats(id),
    queryFn: () => projectsApi.stats(id),
    enabled: !!id,
  });

  const { data: calRes, isLoading: calLoading } = useQuery({
    queryKey: qk.calendarWithBlogs(id),
    queryFn: () => calendarApi.withBlogs(id),
    enabled: !!id,
  });

  const { data: auditsRes } = useQuery({
    queryKey: qk.audits(id),
    queryFn: () => auditsApi.list(id),
    enabled: !!id,
  });

  const project = projectRes?.success ? projectRes.data : null;
  const stats = statsRes?.success && statsRes.data ? statsRes.data : undefined;
  const allEntries: CalendarEntryWithBlog[] = calRes?.success ? calRes.data ?? [] : [];
  const recentEntries = allEntries.slice(0, 5);
  const userCompetitors = (project?.project_competitors ?? []) as ProjectCompetitor[];
  const target = project?.domain ?? "";

  const nextStep = useMemo<WorkflowStepKey>(() => {
    const approved = stats?.approvedKeywords ?? 0;
    const calendar = stats?.calendarEntries ?? 0;
    const blogs = stats?.blogsGenerated ?? 0;
    if (approved === 0) return "discover";
    if (calendar === 0) return "schedule";
    if (blogs === 0) return "generate";
    return "publish";
  }, [stats?.approvedKeywords, stats?.calendarEntries, stats?.blogsGenerated]);

  /* ── loading state ─────────────────────────────────────────── */
  if (!project) {
    if (!projectFetched) {
      return <OverviewSkeleton />;
    }
    return null;
  }

  return (
    <div className="space-y-10 pb-20 pl-4 pr-4">
      {/* ── HEADER ────────────────────────────────────────────── */}
      <header className="pt-4 pb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-text-tertiary">
          <Link
            href="/projects"
            className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-surface-hover hover:text-text-secondary"
          >
            Projects
          </Link>
          <span className="opacity-40">/</span>
          <span className="font-medium text-text-secondary">{project.name}</span>
          <span className="opacity-40">·</span>
          <Globe2 className="h-3 w-3" />
          <span className="font-mono text-text-secondary">{target || project.domain}</span>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0 flex-1">
            <h1 className="text-[40px] font-semibold tracking-[-0.025em] text-text-primary leading-[1.05]">
              {project.name}
            </h1>
            <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-text-secondary">
              {project.company && project.company !== project.name
                ? `${project.company} · `
                : ""}
              {project.niche ? `${project.niche} · ` : ""}
              {regionName(project.target_region)}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ProjectNavLink
              href={`/projects/${id}/keywords`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface-elevated px-3.5 py-2 text-[13px] font-medium text-text-primary transition-all duration-(--duration-fast) hover:-translate-y-0.5 hover:shadow-(--shadow-sm)"
            >
              <Search className="h-3.5 w-3.5" /> Keywords
            </ProjectNavLink>
            <ProjectNavLink
              href={`/projects/${id}/calendar`}
              className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-3.5 py-2 text-[13px] font-semibold text-surface-primary transition-all duration-(--duration-fast) hover:-translate-y-0.5 hover:shadow-(--shadow-md)"
            >
              Open calendar <ArrowRight className="h-3.5 w-3.5" />
            </ProjectNavLink>
          </div>
        </div>
      </header>

      {/* ── STAT STRIP ────────────────────────────────────────── */}
      <StatStrip
        stats={[
          {
            label: "Approved keywords",
            value: stats?.approvedKeywords,
            href: `/projects/${id}/keywords`,
            icon: <Search className="h-3.5 w-3.5" />,
          },
          {
            label: "Calendar entries",
            value: stats?.calendarEntries,
            href: `/projects/${id}/calendar`,
            icon: <Calendar className="h-3.5 w-3.5" />,
          },
          {
            label: "Blogs generated",
            value: stats?.blogsGenerated,
            href: `/projects/${id}/blogs`,
            icon: <FileText className="h-3.5 w-3.5" />,
          },
          {
            label: "Open audits",
            value: stats?.auditPending ?? (auditsRes?.success ? auditsRes.data?.length ?? 0 : 0),
            href: `/projects/${id}/audit`,
            icon: <Activity className="h-3.5 w-3.5" />,
            tone: (stats?.auditPending ?? 0) > 0 ? "warning" : "neutral",
          },
        ]}
      />

      {/* ── NEXT BEST ACTION + WORKFLOW RAIL ──────────────────── */}
      <NextBestAction
        step={nextStep}
        projectId={id}
        approvedKeywords={stats?.approvedKeywords ?? 0}
      />

      <WorkflowRail
        projectId={id}
        approvedKeywords={stats?.approvedKeywords ?? 0}
        calendarEntries={stats?.calendarEntries ?? 0}
        blogsGenerated={stats?.blogsGenerated ?? 0}
      />

      {/* ── BUSINESS BRIEF (preserved) ────────────────────────── */}
      <BusinessBriefSection projectId={id} />

      {/* ── UPCOMING CONTENT ──────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight text-text-primary">
              Upcoming content
            </h2>
            <p className="mt-1 text-[12.5px] text-text-tertiary">
              Next 5 calendar entries · status reflects the live generation pipeline
            </p>
          </div>
          <ProjectNavLink
            href={`/projects/${id}/calendar`}
            className="text-[12.5px] font-medium text-brand-action transition-colors hover:text-brand-action-hover"
          >
            View all →
          </ProjectNavLink>
        </div>

        {calLoading ? (
          <CalendarRowsSkeleton />
        ) : recentEntries.length > 0 ? (
          <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-elevated">
            {recentEntries.map((entry, i) => (
              <CalendarRow key={entry.id} entry={entry} divider={i > 0} projectId={id} />
            ))}
          </div>
        ) : (
          <EmptyCalendarRow projectId={id} />
        )}
      </section>

      {/* ── PROJECT SETUP ─────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight text-text-primary">
              Project setup
            </h2>
            <p className="mt-1 text-[12.5px] text-text-tertiary">
              How Rankit understands this business
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-elevated">
          <dl className="grid grid-cols-1 gap-px bg-border-subtle md:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Company", value: project.company || "—" },
              { label: "Niche", value: project.niche || "—" },
              { label: "Audience", value: project.target_audience || "—" },
              { label: "Domain", value: target || project.domain, mono: true },
            ].map(f => (
              <div key={f.label} className="bg-surface-elevated p-5">
                <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                  {f.label}
                </dt>
                <dd
                  className={`mt-2 text-[14px] leading-relaxed ${
                    f.mono ? "font-mono text-text-primary" : "text-text-secondary"
                  }`}
                >
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
          <div className="grid grid-cols-1 gap-px border-t border-border-subtle bg-border-subtle md:grid-cols-2">
            <div className="bg-surface-elevated p-5">
              <dt className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                <Globe2 className="h-3 w-3" /> Region
              </dt>
              <dd className="mt-2 text-[14px] text-text-secondary">{regionName(project.target_region)}</dd>
            </div>
            <div className="bg-surface-elevated p-5">
              <dt className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-text-tertiary">
                <Users className="h-3 w-3" /> Competitors saved
              </dt>
              <dd className="mt-2 flex flex-wrap gap-1.5">
                {userCompetitors.length > 0 ? (
                  userCompetitors.map(c => (
                    <span
                      key={c.id}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface-secondary px-2 py-0.5 font-mono text-[11.5px] text-text-secondary"
                    >
                      <Globe2 className="h-2.5 w-2.5 text-text-tertiary" />
                      {c.domain}
                    </span>
                  ))
                ) : (
                  <span className="text-[13px] text-text-tertiary">No competitors saved yet.</span>
                )}
              </dd>
            </div>
          </div>
        </div>

        <p className="mt-3 text-[11.5px] text-text-tertiary">
          Created {formatShortDate(project.created_at)} ·
          {project.updated_at ? ` updated ${formatRelativeTime(project.updated_at)}` : ""}
        </p>
      </section>
    </div>
  );
}

/* ───────── pieces ───────── */

function StatStrip({
  stats,
}: {
  stats: {
    label: string;
    value?: number;
    href: string;
    icon: React.ReactNode;
    tone?: StatusTone;
  }[];
}) {
  return (
    <section className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle md:grid-cols-4">
      {stats.map(s => (
        <Link
          key={s.label}
          href={s.href}
          className="group flex flex-col gap-2 bg-surface-elevated p-5 transition-colors duration-(--duration-fast) hover:bg-surface-hover"
        >
          <div className="flex items-center justify-between text-text-tertiary">
            <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
              {s.icon} {s.label}
            </span>
            <ArrowRight className="h-3.5 w-3.5 -translate-x-1 opacity-0 transition-all duration-(--duration-fast) group-hover:translate-x-0 group-hover:opacity-60" />
          </div>
          <div className="text-[26px] font-semibold tracking-tight tabular-nums text-text-primary">
            {s.value == null ? <Skeleton className="h-7 w-12" /> : formatCompactNumber(s.value)}
          </div>
        </Link>
      ))}
    </section>
  );
}

function NextBestAction({
  step,
  projectId,
  approvedKeywords,
}: {
  step: WorkflowStepKey;
  projectId: string;
  approvedKeywords: number;
}) {
  const map: Record<
    WorkflowStepKey,
    { title: string; sub: string; cta: string; href: string; icon: React.ReactNode }
  > = {
    discover: {
      title: "Discover keywords for this business",
      sub: "Run discovery to surface real demand from Ahrefs + DataForSEO, classified by funnel and topical relevance.",
      cta: "Start keyword discovery",
      href: `/projects/${projectId}/keywords`,
      icon: <Search className="h-4 w-4" />,
    },
    analyze: {
      title: "Analyze competitors",
      sub: "See where competitors rank, what they cover, and which gaps you can ship into this quarter.",
      cta: "Open competitors",
      href: `/projects/${projectId}/competitors`,
      icon: <Target className="h-4 w-4" />,
    },
    schedule: {
      title: `Schedule ${approvedKeywords} approved keywords`,
      sub: "Move approved keywords into the editorial calendar so the AI can queue them up for generation.",
      cta: "Open calendar",
      href: `/projects/${projectId}/calendar`,
      icon: <Calendar className="h-4 w-4" />,
    },
    generate: {
      title: "Generate your first blog",
      sub: "Calendar entries are ready. Generate Article + FAQ JSON-LD blogs in minutes with full internal linking.",
      cta: "Open content studio",
      href: `/projects/${projectId}/content-generator`,
      icon: <Wand2 className="h-4 w-4" />,
    },
    publish: {
      title: "Audit, repair, publish",
      sub: "Your pipeline is live. Run Content Health audits to keep existing pages compounding traffic.",
      cta: "Open Content Health",
      href: `/projects/${projectId}/audit`,
      icon: <Activity className="h-4 w-4" />,
    },
  };

  const cfg = map[step];

  return (
    <section className="relative overflow-hidden rounded-card border border-border-subtle bg-surface-elevated">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-[280px] w-[280px] rounded-full bg-brand-violet/15 blur-[80px]"
      />
      <div className="relative flex flex-wrap items-center gap-6 p-6 sm:flex-nowrap">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-secondary text-brand-violet shadow-(--shadow-glow-sm)">
          {cfg.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="ai-orb" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-violet">
              Next best action
            </span>
          </div>
          <h3 className="mt-1.5 text-[18px] font-semibold tracking-tight text-text-primary">
            {cfg.title}
          </h3>
          <p className="mt-1 max-w-[680px] text-[13px] leading-relaxed text-text-tertiary">{cfg.sub}</p>
        </div>
        <ProjectNavLink
          href={cfg.href}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-text-primary px-4 py-2 text-[13px] font-semibold text-surface-primary shadow-(--shadow-sm) transition-all duration-(--duration-fast) hover:-translate-y-0.5 hover:shadow-(--shadow-md)"
        >
          {cfg.cta} <ArrowRight className="h-3.5 w-3.5" />
        </ProjectNavLink>
      </div>
    </section>
  );
}

function WorkflowRail({
  projectId,
  approvedKeywords,
  calendarEntries,
  blogsGenerated,
}: {
  projectId: string;
  approvedKeywords: number;
  calendarEntries: number;
  blogsGenerated: number;
}) {
  const steps = [
    {
      label: "Discover",
      sub: "Keyword research",
      icon: Search,
      href: `/projects/${projectId}/keywords`,
      done: approvedKeywords > 0,
    },
    {
      label: "Analyze",
      sub: "Competitor gaps",
      icon: Target,
      href: `/projects/${projectId}/competitors`,
      done: false,
    },
    {
      label: "Schedule",
      sub: "Content calendar",
      icon: Calendar,
      href: `/projects/${projectId}/calendar`,
      done: calendarEntries > 0,
    },
    {
      label: "Generate",
      sub: "Studio + AI",
      icon: Wand2,
      href: `/projects/${projectId}/content-generator`,
      done: blogsGenerated > 0,
    },
    {
      label: "Audit",
      sub: "Content Health",
      icon: Activity,
      href: `/projects/${projectId}/audit`,
      done: false,
    },
  ];

  return (
    <section>
      <h2 className="text-[14px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
        Workflow
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {steps.map(step => (
          <ProjectNavLink
            key={step.label}
            href={step.href}
            className="group flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-elevated p-4 transition-all duration-(--duration-fast) hover:-translate-y-0.5 hover:border-border-default hover:shadow-(--shadow-sm)"
          >
            <div className="flex items-center justify-between">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-md border ${
                  step.done
                    ? "border-status-success/30 bg-status-success/10 text-status-success"
                    : "border-border-subtle bg-surface-secondary text-text-secondary group-hover:text-brand-violet"
                }`}
              >
                <step.icon className="h-3.5 w-3.5" />
              </span>
              {step.done && (
                <StatusBadge tone="success" size="xs" rounded="md">
                  Done
                </StatusBadge>
              )}
            </div>
            <div>
              <div className="text-[13.5px] font-semibold text-text-primary">{step.label}</div>
              <div className="mt-0.5 text-[11.5px] text-text-tertiary">{step.sub}</div>
            </div>
          </ProjectNavLink>
        ))}
      </div>
    </section>
  );
}

function CalendarRow({
  entry,
  divider,
  projectId,
}: {
  entry: CalendarEntryWithBlog;
  divider: boolean;
  projectId: string;
}) {
  const date = new Date(entry.scheduled_date);
  const tone: StatusTone = STATUS_TONE[entry.status] ?? "neutral";
  const label = STATUS_LABEL[entry.status] ?? entry.status;
  const blogId = entry.blog?.id;

  return (
    <ProjectNavLink
      href={blogId ? `/projects/${projectId}/blogs/${blogId}` : `/projects/${projectId}/calendar`}
      className={`group flex items-center gap-5 px-5 py-4 transition-colors hover:bg-surface-hover ${
        divider ? "border-t border-border-subtle" : ""
      }`}
    >
      <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md border border-border-subtle bg-surface-secondary">
        <span className="text-[10px] font-semibold uppercase leading-none text-text-tertiary">
          {date.toLocaleDateString("en-US", { month: "short" })}
        </span>
        <span className="mt-1 text-[15px] font-semibold leading-none text-text-primary">
          {date.getDate()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-medium text-text-primary">{entry.title}</p>
        <p className="mt-0.5 truncate text-[12.5px] text-text-tertiary">
          {entry.focus_keyword} · {entry.article_type}
        </p>
      </div>
      <StatusBadge tone={tone} size="sm">
        {label}
      </StatusBadge>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
    </ProjectNavLink>
  );
}

function CalendarRowsSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-elevated">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center gap-5 p-5 ${i > 0 ? "border-t border-border-subtle" : ""}`}
        >
          <Skeleton className="h-12 w-12 shrink-0" rounded="md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" rounded="sm" />
            <Skeleton className="h-3 w-1/3" rounded="sm" />
          </div>
          <Skeleton className="h-6 w-20 shrink-0" rounded="full" />
        </div>
      ))}
    </div>
  );
}

function EmptyCalendarRow({ projectId }: { projectId: string }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card border border-dashed border-border-strong bg-surface-secondary/40 px-6 py-14 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated text-brand-violet">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="max-w-[420px]">
        <h3 className="text-[15px] font-semibold tracking-tight text-text-primary">
          No content scheduled yet
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-tertiary">
          Approve keywords and Rankit will generate a 30-day editorial calendar that fills the queue automatically.
        </p>
      </div>
      <ProjectNavLink
        href={`/projects/${projectId}/keywords`}
        className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-3.5 py-2 text-[13px] font-semibold text-surface-primary"
      >
        Approve keywords <ArrowRight className="h-3.5 w-3.5" />
      </ProjectNavLink>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-10 pb-20 pl-4 pr-4">
      <div className="pt-4 pb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Skeleton className="h-4 w-16" rounded="sm" />
          <Skeleton className="h-3 w-3 rounded-full" />
          <Skeleton className="h-4 w-32" rounded="sm" />
        </div>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3">
            <Skeleton className="h-[44px] w-72" rounded="lg" />
            <Skeleton className="h-4 w-60" rounded="sm" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" rounded="full" />
            <Skeleton className="h-9 w-32" rounded="full" />
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px rounded-card border border-border-subtle bg-border-subtle md:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="space-y-2 bg-surface-elevated p-5">
            <Skeleton className="h-3 w-28" rounded="sm" style={{ animationDelay: `${i * 60}ms` }} />
            <Skeleton className="h-7 w-16" rounded="md" style={{ animationDelay: `${i * 60 + 40}ms` }} />
          </div>
        ))}
      </div>
      <Skeleton className="h-32 w-full" rounded="lg" />
      <Skeleton className="h-40 w-full" rounded="lg" />
    </div>
  );
}
