"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { qk, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import { calendarApi } from "@/frontend/api/calendar";
import { projectsApi } from "@/frontend/api/projects";
import type { CalendarEntryWithBlog, CalendarStatus } from "@/lib/types";
import { TARGET_REGIONS } from "@/lib/types";
import { Skeleton } from "@/components/Skeleton";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { formatCompactNumber } from "@/utils/format";
import {
  Search,
  Wand2,
  Calendar,
  FileText,
  ArrowRight,
  Sparkles,
  Globe2,
  CheckCircle2,
  Clock,
  Download,
  AlertCircle,
  ChevronRight,
  Zap,
  BookOpen,
  TrendingUp,
  Eye,
} from "lucide-react";

/* ─────────── helpers ─────────── */

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
  generating: "Generating…",
  generated: "Ready",
  downloaded: "Downloaded",
  published: "Published",
  approved: "Approved",
};

function todayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function entryDateString(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayLabel(dateStr: string): string {
  const today = todayDateString();
  const d = entryDateString(dateStr);
  const diff = Math.round((new Date(d).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Map article_type string → content-generator route slug */
function articleTypeToSlug(articleType: string): string {
  const t = (articleType ?? "").toLowerCase();
  if (t.includes("linkedin")) return "linkedin";
  if (t.includes("ebook")) return "ebooks";
  if (t.includes("whitepaper")) return "whitepapers";
  return "blogs";
}

/** URL to open the generator for a scheduled entry (typewriter animation fills keyword) */
function entryGeneratorUrl(entry: CalendarEntryWithBlog, projectId: string): string {
  const slug = articleTypeToSlug(entry.article_type);
  const p = new URLSearchParams({ entryId: entry.id });
  if (entry.focus_keyword) p.set("keyword", entry.focus_keyword);
  return `/projects/${projectId}/content-generator/${slug}?${p.toString()}`;
}

/** URL to view/download an already-generated entry */
function entryViewUrl(entry: CalendarEntryWithBlog, projectId: string): string {
  const blogId = entry.blog?.id;
  if (!blogId) return entryGeneratorUrl(entry, projectId);
  const slug = articleTypeToSlug(entry.article_type);
  return `/projects/${projectId}/content-generator/${slug}/${blogId}`;
}

type ProjectPhase = "new" | "keywords" | "schedule" | "generate" | "active";

/* ─────────── page ─────────── */

export default function ProjectOverviewPage() {
  const { id } = useParams<{ id: string }>();

  const { data: projectRes, isFetched: projectFetched } = useQuery({
    queryKey: qk.project(id),
    queryFn: () => projectsApi.get(id),
    enabled: !!id,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const { data: statsRes } = useQuery({
    queryKey: qk.projectStats(id),
    queryFn: () => projectsApi.stats(id),
    enabled: !!id,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const { data: calRes, isLoading: calLoading } = useQuery({
    queryKey: qk.calendarWithBlogs(id),
    queryFn: () => calendarApi.withBlogs(id),
    enabled: !!id,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const project = projectRes?.success ? projectRes.data : null;
  const stats = statsRes?.success && statsRes.data ? statsRes.data : undefined;
  const allEntries: CalendarEntryWithBlog[] = useMemo(
    () => (calRes?.success ? calRes.data ?? [] : []),
    [calRes]
  );

  const today = todayDateString();

  const todayEntries = useMemo(
    () => allEntries.filter(e => entryDateString(e.scheduled_date) === today),
    [allEntries, today]
  );

  const upcomingEntries = useMemo(() => {
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekOut = new Date(today);
    weekOut.setDate(weekOut.getDate() + 7);
    return allEntries
      .filter(e => {
        const d = new Date(entryDateString(e.scheduled_date));
        return d >= tomorrow && d <= weekOut;
      })
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
      .slice(0, 6);
  }, [allEntries, today]);

  const downloadedEntries = useMemo(
    () => allEntries.filter(e => e.status === "downloaded"),
    [allEntries]
  );

  const phase = useMemo<ProjectPhase>(() => {
    const total = stats?.totalKeywords ?? 0;
    const calendar = stats?.calendarEntries ?? 0;
    const generated = stats?.blogsGenerated ?? 0;
    if (total === 0) return "new";
    if (calendar === 0) return "schedule";
    if (generated === 0) return "generate";
    if (generated < 3) return "keywords";
    return "active";
  }, [stats]);

  if (!project) {
    if (!projectFetched) return <OverviewSkeleton />;
    return null;
  }

  return (
    <div className="pb-20 -mt-6 lg:-mt-8">
      {/* ── Header ── */}
      <div className="sticky -top-6 lg:-top-8 z-20 -mx-6 lg:-mx-8 mb-6">
        <div className="border-b border-border-subtle/70 bg-surface-primary/95 backdrop-blur-md px-6 lg:px-8 pt-6 lg:pt-8 pb-4">
          {/* Gradient glow top accent */}
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-violet/40 to-transparent" />

          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary mb-1.5">
                <Link href="/projects" className="hover:text-text-secondary transition-colors">Projects</Link>
                <ChevronRight className="h-3 w-3 opacity-40" />
                <span className="text-text-secondary font-medium truncate">{project.name}</span>
                <span className="opacity-40 mx-0.5">·</span>
                <Globe2 className="h-3 w-3" />
                <span className="font-mono text-text-tertiary">{project.domain}</span>
              </div>
              <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-text-primary leading-tight truncate">
                {project.name}
              </h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <ProjectNavLink
                href={`/projects/${id}/keywords`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface-elevated px-3.5 py-1.5 text-[12.5px] font-medium text-text-primary transition-all hover:-translate-y-0.5 hover:shadow-sm"
              >
                <Search className="h-3.5 w-3.5" /> Keywords
              </ProjectNavLink>
              <ProjectNavLink
                href={`/projects/${id}/content-generator`}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-violet px-3.5 py-1.5 text-[12.5px] font-semibold text-white shadow-[0_0_16px_rgba(99,102,241,0.3)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(99,102,241,0.4)]"
              >
                <Wand2 className="h-3.5 w-3.5" /> Generate
              </ProjectNavLink>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-6">
        {/* ── Metrics strip ── */}
        <StatStrip projectId={id} stats={stats} />

        {/* ── Today's Focus ── */}
        <AIDailyBrief
          phase={phase}
          projectId={id}
          todayEntries={todayEntries}
          approvedKeywords={stats?.totalKeywords ?? 0}
          calendarEntries={stats?.calendarEntries ?? 0}
          generated={stats?.blogsGenerated ?? 0}
        />

        {/* ── Today's content ── */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-brand-violet" />
              <h2 className="text-[14px] font-semibold text-text-primary">Today's content</h2>
              {todayEntries.length > 0 && (
                <span className="inline-flex items-center justify-center h-4.5 min-w-[18px] rounded-full bg-brand-violet/15 text-[10px] font-bold text-brand-violet px-1.5">
                  {todayEntries.length}
                </span>
              )}
              <span className="text-[11.5px] text-text-tertiary">
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
              </span>
            </div>
            <ProjectNavLink
              href={`/projects/${id}/content-calendar`}
              className="text-[12px] font-medium text-brand-violet hover:text-brand-action-hover transition-colors"
            >
              Open calendar →
            </ProjectNavLink>
          </div>

          {calLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-[60px] w-full rounded-xl border border-border-subtle bg-surface-elevated animate-pulse" />
              ))}
            </div>
          ) : todayEntries.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated divide-y divide-border-subtle/60">
              {todayEntries.map(entry => (
                <TodayEntryRow key={entry.id} entry={entry} projectId={id} />
              ))}
            </div>
          ) : (
            <EmptyToday projectId={id} phase={phase} />
          )}
        </section>

        {/* ── Upcoming content ── */}
        {upcomingEntries.length > 0 && (
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[14px] font-semibold text-text-primary">Coming up this week</h2>
              <ProjectNavLink
                href={`/projects/${id}/content-calendar`}
                className="text-[12px] font-medium text-brand-violet hover:text-brand-action-hover transition-colors"
              >
                View all →
              </ProjectNavLink>
            </div>
            <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated divide-y divide-border-subtle/60">
              {upcomingEntries.map(entry => (
                <UpcomingRow key={entry.id} entry={entry} projectId={id} />
              ))}
            </div>
          </section>
        )}

        {/* ── Downloaded tracker ── */}
        {downloadedEntries.length > 0 && (
          <DownloadedTracker entries={downloadedEntries} projectId={id} />
        )}

        {/* ── Quick actions ── */}
        <section>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-tertiary mb-3">
            Quick actions
          </h2>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              {
                href: `/projects/${id}/keywords`,
                icon: <Search className="h-4 w-4" />,
                label: "Keywords",
                sub: `${formatCompactNumber(stats?.totalKeywords ?? 0)} found`,
                color: "text-violet-500",
                bg: "bg-violet-500/10",
              },
              {
                href: `/projects/${id}/content-calendar`,
                icon: <Calendar className="h-4 w-4" />,
                label: "Calendar",
                sub: `${formatCompactNumber(stats?.calendarEntries ?? 0)} scheduled`,
                color: "text-blue-500",
                bg: "bg-blue-500/10",
              },
              {
                href: `/projects/${id}/content-generator`,
                icon: <Wand2 className="h-4 w-4" />,
                label: "Generate",
                sub: "Blogs, ebooks, LinkedIn",
                color: "text-emerald-500",
                bg: "bg-emerald-500/10",
              },
              {
                href: `/projects/${id}/content-history`,
                icon: <FileText className="h-4 w-4" />,
                label: "Library",
                sub: `${formatCompactNumber(stats?.blogsGenerated ?? 0)} created`,
                color: "text-amber-500",
                bg: "bg-amber-500/10",
              },
            ].map(item => (
              <ProjectNavLink
                key={item.label}
                href={item.href}
                className="group flex flex-col gap-2.5 rounded-xl border border-border-subtle bg-surface-elevated p-3.5 transition-all hover:-translate-y-0.5 hover:border-border-default hover:shadow-sm"
              >
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.bg} ${item.color}`}>
                  {item.icon}
                </span>
                <div>
                  <div className="text-[13px] font-semibold text-text-primary">{item.label}</div>
                  <div className="text-[11px] text-text-tertiary mt-0.5">{item.sub}</div>
                </div>
              </ProjectNavLink>
            ))}
          </div>
        </section>

        {/* ── Content Health teaser ── */}
        <section className="rounded-xl border border-dashed border-border-subtle/80 bg-surface-secondary/20 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated text-text-tertiary">
              <AlertCircle className="h-3.5 w-3.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold text-text-primary">Content Health Audit</span>
                <span className="inline-flex items-center rounded-full border border-border-subtle bg-surface-elevated px-1.5 py-0.5 text-[10px] font-semibold text-text-tertiary">
                  Coming soon
                </span>
              </div>
              <p className="text-[11.5px] text-text-tertiary mt-0.5">
                Track live URL performance, surface decaying pages, and queue fixes automatically.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─────────── StatStrip ─────────── */

function StatStrip({
  projectId,
  stats,
}: {
  projectId: string;
  stats?: {
    totalKeywords: number;
    approvedKeywords: number;
    calendarEntries: number;
    blogsGenerated: number;
    articlesInLibrary?: number;
  } | undefined;
}) {
  const items = [
    {
      label: "In library",
      value: stats?.articlesInLibrary,
      href: `/projects/${projectId}/content-history`,
      icon: <BookOpen className="h-3.5 w-3.5" />,
      accentColor: "text-brand-violet",
    },
    {
      label: "Scheduled",
      value: stats?.calendarEntries,
      href: `/projects/${projectId}/content-calendar`,
      icon: <Calendar className="h-3.5 w-3.5" />,
      accentColor: "text-blue-500",
    },
    {
      label: "Generated",
      value: stats?.blogsGenerated,
      href: `/projects/${projectId}/content-history`,
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      accentColor: "text-emerald-500",
    },
    {
      label: "Total keywords",
      value: stats?.totalKeywords,
      href: `/projects/${projectId}/keywords`,
      icon: <Globe2 className="h-3.5 w-3.5" />,
      accentColor: "text-amber-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle md:grid-cols-4">
      {items.map(s => (
        <Link
          key={s.label}
          href={s.href}
          className="group flex flex-col gap-1.5 bg-surface-elevated px-4 py-4 transition-colors hover:bg-surface-hover"
        >
          <div className="flex items-center justify-between">
            <span className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-text-tertiary`}>
              <span className={s.accentColor}>{s.icon}</span>
              {s.label}
            </span>
            <ArrowRight className="h-3 w-3 text-text-tertiary opacity-0 transition-all group-hover:opacity-50" />
          </div>
          <div className="text-[22px] font-semibold tracking-tight tabular-nums text-text-primary">
            {s.value == null ? <Skeleton className="h-6 w-10 mt-0.5" /> : formatCompactNumber(s.value)}
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ─────────── AI Daily Brief ─────────── */

const BRIEF_CONFIG: Record<
  ProjectPhase,
  { title: string; body: string; cta: string; href: (id: string) => string; icon: React.ReactNode; phase: ProjectPhase }
> = {
  new: {
    title: "Start with keyword discovery",
    body: "Your project is set up. The first step is discovering which keywords your audience actually searches for — this drives everything else.",
    cta: "Discover keywords",
    href: id => `/projects/${id}/keywords`,
    icon: <Search className="h-5 w-5" />,
    phase: "new",
  },
  keywords: {
    title: "Schedule your keywords",
    body: "You've found keywords. Next: move them onto the editorial calendar so the AI can queue content generation for you.",
    cta: "Open calendar",
    href: id => `/projects/${id}/content-calendar`,
    icon: <Calendar className="h-5 w-5" />,
    phase: "keywords",
  },
  schedule: {
    title: "No content scheduled yet",
    body: "Go to your keyword list, pick the best ones, and schedule them to dates. That's what kicks off the generation pipeline.",
    cta: "Schedule keywords →",
    href: id => `/projects/${id}/keywords`,
    icon: <Calendar className="h-5 w-5" />,
    phase: "schedule",
  },
  generate: {
    title: "Generate your first piece of content",
    body: "Content is scheduled. Open the generator, pick a type (blog, ebook, LinkedIn), and let AI draft it with your keyword and brief.",
    cta: "Open content studio",
    href: id => `/projects/${id}/content-generator`,
    icon: <Wand2 className="h-5 w-5" />,
    phase: "generate",
  },
  active: {
    title: "Keep the pipeline moving",
    body: "Content is generating regularly. Download finished pieces, post them on your site, and keep the calendar full to compound your ranking growth.",
    cta: "Open calendar",
    href: id => `/projects/${id}/content-calendar`,
    icon: <Zap className="h-5 w-5" />,
    phase: "active",
  },
};

function AIDailyBrief({
  phase, projectId, todayEntries, approvedKeywords, calendarEntries, generated,
}: {
  phase: ProjectPhase;
  projectId: string;
  todayEntries: CalendarEntryWithBlog[];
  approvedKeywords: number;
  calendarEntries: number;
  generated: number;
}) {
  const todayCount = todayEntries.length;
  const cfg = BRIEF_CONFIG[todayCount > 0 ? "active" : phase];

  // Find the most actionable entry for today
  const actionEntry = todayEntries.find(e => e.status === "scheduled")
    ?? todayEntries.find(e => e.status === "generated" || e.status === "approved")
    ?? todayEntries[0];

  const isGenerated = actionEntry && (actionEntry.status === "generated" || actionEntry.status === "approved");
  const isDone = actionEntry && (actionEntry.status === "downloaded" || actionEntry.status === "published");

  let actionHref: string;
  let actionLabel: string;
  let actionIcon: React.ReactNode;

  if (todayCount === 0) {
    actionHref = cfg.href(projectId);
    actionLabel = cfg.cta;
    actionIcon = <ArrowRight className="h-3.5 w-3.5" />;
  } else if (isDone) {
    actionHref = entryViewUrl(actionEntry!, projectId);
    actionLabel = "View content";
    actionIcon = <Eye className="h-3.5 w-3.5" />;
  } else if (isGenerated) {
    actionHref = entryViewUrl(actionEntry!, projectId);
    actionLabel = "View & Download";
    actionIcon = <Download className="h-3.5 w-3.5" />;
  } else if (actionEntry) {
    actionHref = entryGeneratorUrl(actionEntry, projectId);
    actionLabel = "Generate now";
    actionIcon = <Wand2 className="h-3.5 w-3.5" />;
  } else {
    actionHref = cfg.href(projectId);
    actionLabel = cfg.cta;
    actionIcon = <ArrowRight className="h-3.5 w-3.5" />;
  }

  const title = todayCount > 0
    ? `You have ${todayCount} piece${todayCount > 1 ? "s" : ""} scheduled for today`
    : cfg.title;

  const body = todayCount > 0
    ? (isDone
        ? `All content for today is downloaded. Post it on your site to start building ranking momentum.`
        : isGenerated
          ? `${todayCount > 1 ? "These are" : "This is"} generated and ready to download. Review and post to your site.`
          : `${todayCount > 1 ? "These are" : "This is"} ready to generate. Tap below to open the content studio with your keyword pre-filled.`)
    : cfg.body;

  return (
    <section className="relative overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated">
      {/* Violet glow */}
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-[200px] w-[200px] rounded-full bg-brand-violet/10 blur-[60px]" />
      {/* Top accent line */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-brand-violet/60 to-transparent" />

      <div className="relative flex flex-wrap items-start gap-4 p-5 sm:flex-nowrap">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
          todayCount > 0
            ? "border-brand-violet/30 bg-brand-violet/12 text-brand-violet"
            : "border-border-subtle bg-surface-secondary text-text-secondary"
        }`}>
          {todayCount > 0 ? <Sparkles className="h-4.5 w-4.5" /> : cfg.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="ai-orb" />
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-violet">
              Today's focus
            </span>
          </div>
          <h3 className="text-[15px] font-semibold tracking-tight text-text-primary leading-snug">{title}</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-text-tertiary max-w-[600px]">{body}</p>
        </div>
        <ProjectNavLink
          href={actionHref}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-violet px-4 py-2 text-[12.5px] font-semibold text-white shadow-[0_0_16px_rgba(99,102,241,0.25)] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_24px_rgba(99,102,241,0.35)]"
        >
          {actionLabel} {actionIcon}
        </ProjectNavLink>
      </div>
    </section>
  );
}

/* ─────────── Today entry row ─────────── */

function TodayEntryRow({ entry, projectId }: { entry: CalendarEntryWithBlog; projectId: string }) {
  const tone: StatusTone = STATUS_TONE[entry.status] ?? "neutral";
  const label = STATUS_LABEL[entry.status] ?? entry.status;

  const isScheduled = entry.status === "scheduled";
  const isGenerating = entry.status === "generating";
  const isReady = entry.status === "generated" || entry.status === "approved";
  const isDone = entry.status === "downloaded" || entry.status === "published";

  const rowHref = isDone || isReady
    ? entryViewUrl(entry, projectId)
    : isScheduled
      ? entryGeneratorUrl(entry, projectId)
      : `/projects/${projectId}/content-calendar`;

  return (
    <ProjectNavLink
      href={rowHref}
      className="group flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hover/60 transition-colors"
    >
      {/* Status icon */}
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-colors ${
        isDone
          ? "bg-status-success/10 text-status-success border-status-success/20"
          : isReady
            ? "bg-brand-violet/10 text-brand-violet border-brand-violet/20"
            : isGenerating
              ? "bg-status-warning/10 text-status-warning border-status-warning/20"
              : "bg-surface-secondary text-text-tertiary border-border-subtle"
      }`}>
        {isDone
          ? <CheckCircle2 className="h-3.5 w-3.5" />
          : isReady
            ? <Download className="h-3.5 w-3.5" />
            : isGenerating
              ? <Zap className="h-3.5 w-3.5" />
              : <Wand2 className="h-3.5 w-3.5" />}
      </span>

      {/* Content info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-text-primary">{entry.title}</p>
        <p className="mt-0.5 text-[11.5px] text-text-tertiary truncate">
          {entry.focus_keyword}
          {entry.article_type ? ` · ${entry.article_type}` : ""}
        </p>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2.5 shrink-0">
        <StatusBadge tone={tone} size="sm">{label}</StatusBadge>

        {isScheduled && (
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-brand-violet/10 border border-brand-violet/20 px-2.5 py-1 text-[11px] font-semibold text-brand-violet transition-all group-hover:bg-brand-violet group-hover:text-white">
            <Wand2 className="h-3 w-3" /> Generate
          </span>
        )}
        {isReady && (
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-brand-violet/10 border border-brand-violet/20 px-2.5 py-1 text-[11px] font-semibold text-brand-violet transition-all group-hover:bg-brand-violet group-hover:text-white">
            <Download className="h-3 w-3" /> View & Download
          </span>
        )}
        {isDone && (
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-status-success/10 border border-status-success/20 px-2.5 py-1 text-[11px] font-semibold text-status-success">
            <Eye className="h-3 w-3" /> View
          </span>
        )}
        {isGenerating && (
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-status-warning/10 border border-status-warning/20 px-2.5 py-1 text-[11px] font-medium text-status-warning">
            <Zap className="h-3 w-3" /> Generating…
          </span>
        )}

        <ChevronRight className="h-4 w-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </ProjectNavLink>
  );
}

/* ─────────── Upcoming row ─────────── */

function UpcomingRow({ entry, projectId }: { entry: CalendarEntryWithBlog; projectId: string }) {
  const tone: StatusTone = STATUS_TONE[entry.status] ?? "neutral";
  const label = STATUS_LABEL[entry.status] ?? entry.status;
  const dayLabel = formatDayLabel(entry.scheduled_date);

  const isScheduled = entry.status === "scheduled";
  const isReady = entry.status === "generated" || entry.status === "approved";

  const rowHref = isReady
    ? entryViewUrl(entry, projectId)
    : isScheduled
      ? entryGeneratorUrl(entry, projectId)
      : `/projects/${projectId}/content-calendar`;

  return (
    <ProjectNavLink
      href={rowHref}
      className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-hover/60 transition-colors"
    >
      <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border border-border-subtle bg-surface-secondary text-center">
        <span className="text-[8.5px] font-bold uppercase leading-none text-text-tertiary">
          {new Date(entry.scheduled_date).toLocaleDateString("en-US", { month: "short" })}
        </span>
        <span className="mt-0.5 text-[14px] font-bold leading-none text-text-primary">
          {new Date(entry.scheduled_date).getDate()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-text-primary">{entry.title}</p>
        <p className="mt-0.5 text-[11px] text-text-tertiary truncate">
          {dayLabel} · {entry.focus_keyword}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge tone={tone} size="sm">{label}</StatusBadge>
        {isScheduled && (
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-brand-violet/8 border border-brand-violet/15 px-2 py-0.5 text-[10.5px] font-medium text-brand-violet opacity-0 group-hover:opacity-100 transition-opacity">
            <Wand2 className="h-2.5 w-2.5" /> Generate
          </span>
        )}
        {isReady && (
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-brand-violet/8 border border-brand-violet/15 px-2 py-0.5 text-[10.5px] font-medium text-brand-violet opacity-0 group-hover:opacity-100 transition-opacity">
            <Download className="h-2.5 w-2.5" /> Download
          </span>
        )}
      </div>
    </ProjectNavLink>
  );
}

/* ─────────── Downloaded tracker ─────────── */

function DownloadedTracker({
  entries,
  projectId,
}: {
  entries: CalendarEntryWithBlog[];
  projectId: string;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  function handleSave(entryId: string) {
    if (!urls[entryId]?.trim()) return;
    setSaved(s => ({ ...s, [entryId]: true }));
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <CheckCircle2 className="h-3.5 w-3.5 text-status-success" />
        <h2 className="text-[14px] font-semibold text-text-primary">Track what you've published</h2>
      </div>
      <p className="text-[12px] text-text-tertiary mb-3">
        {entries.length} piece{entries.length > 1 ? "s" : ""} downloaded. Add the URL where you posted it — we'll track performance in future.
      </p>
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated divide-y divide-border-subtle/60">
        {entries.slice(0, 3).map(entry => (
          <div key={entry.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-text-primary">{entry.title}</p>
              <p className="mt-0.5 text-[11px] text-text-tertiary">{entry.focus_keyword}</p>
            </div>
            {saved[entry.id] ? (
              <span className="flex items-center gap-1.5 text-[11.5px] text-status-success font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> URL saved
              </span>
            ) : (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="url"
                  value={urls[entry.id] ?? ""}
                  onChange={e => setUrls(u => ({ ...u, [entry.id]: e.target.value }))}
                  placeholder="https://yoursite.com/your-post"
                  className="flex-1 sm:w-52 rounded-lg border border-border-default bg-surface-secondary px-3 py-1.5 text-[12px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-violet focus:ring-1 focus:ring-brand-violet/20"
                />
                <button
                  onClick={() => handleSave(entry.id)}
                  disabled={!urls[entry.id]?.trim()}
                  className="rounded-lg border border-border-default bg-surface-elevated px-3 py-1.5 text-[12px] font-medium text-text-primary hover:border-brand-violet/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────── Empty states ─────────── */

function EmptyToday({ projectId, phase }: { projectId: string; phase: ProjectPhase }) {
  const messages: Record<ProjectPhase, { title: string; sub: string; cta: string; href: string; icon: React.ReactNode }> = {
    new: {
      title: "No keywords discovered yet",
      sub: "Discover keywords for your niche first — that's what powers everything else.",
      cta: "Discover keywords",
      href: `/projects/${projectId}/keywords`,
      icon: <Search className="h-4 w-4" />,
    },
    keywords: {
      title: "Nothing scheduled today",
      sub: "You have keywords found. Add them to the calendar to start generating content.",
      cta: "Open calendar",
      href: `/projects/${projectId}/content-calendar`,
      icon: <Calendar className="h-4 w-4" />,
    },
    schedule: {
      title: "No keywords scheduled yet",
      sub: "Go to keywords, approve your favourites, then schedule them to dates so AI can generate your content.",
      cta: "Schedule keywords",
      href: `/projects/${projectId}/keywords`,
      icon: <Calendar className="h-4 w-4" />,
    },
    generate: {
      title: "Content is scheduled — not yet generated",
      sub: "Head to the content studio and generate the pieces in your calendar.",
      cta: "Open content studio",
      href: `/projects/${projectId}/content-generator`,
      icon: <Wand2 className="h-4 w-4" />,
    },
    active: {
      title: "Nothing due today",
      sub: "Your calendar is active. Check upcoming content or add more keywords to keep the pipeline full.",
      cta: "Open calendar",
      href: `/projects/${projectId}/content-calendar`,
      icon: <Calendar className="h-4 w-4" />,
    },
  };

  const msg = messages[phase];

  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-default/70 bg-surface-secondary/30 px-6 py-8 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-violet/20 bg-brand-violet/8 text-brand-violet">
        {msg.icon}
      </span>
      <div className="max-w-[360px]">
        <h3 className="text-[13.5px] font-semibold tracking-tight text-text-primary">{msg.title}</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-text-tertiary">{msg.sub}</p>
      </div>
      <ProjectNavLink
        href={msg.href}
        className="inline-flex items-center gap-1.5 rounded-full bg-brand-violet px-4 py-1.5 text-[12.5px] font-semibold text-white shadow-[0_0_12px_rgba(99,102,241,0.2)] transition-all hover:-translate-y-0.5"
      >
        {msg.cta} <ArrowRight className="h-3.5 w-3.5" />
      </ProjectNavLink>
    </div>
  );
}

/* ─────────── Skeleton ─────────── */

function OverviewSkeleton() {
  return (
    <div className="pb-20 -mt-6 lg:-mt-8">
      <div className="h-24 border-b border-border-subtle bg-surface-primary/90 -mx-6 lg:-mx-8 px-6 lg:px-8 mb-6 pt-6 lg:pt-8">
        <Skeleton className="h-4 w-40 mb-2" />
        <Skeleton className="h-7 w-56" />
      </div>
      <div className="px-4 space-y-6">
        <div className="grid grid-cols-2 gap-px rounded-xl border border-border-subtle bg-border-subtle md:grid-cols-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="bg-surface-elevated p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-10" />
            </div>
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-36 mb-3" />
          <Skeleton className="h-[60px] w-full rounded-xl" />
          <Skeleton className="h-[60px] w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
