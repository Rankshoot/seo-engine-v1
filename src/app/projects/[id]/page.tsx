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
  ExternalLink,
  CheckCircle2,
  Clock,
  Download,
  AlertCircle,
  Plus,
  ChevronRight,
  Zap,
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

function todayDateString(tzOffset?: number): string {
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

function regionName(code: string): string {
  return TARGET_REGIONS.find(r => r.code === code?.toLowerCase())?.name ?? code?.toUpperCase() ?? "";
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

  // Next 7 days (excluding today), sorted ascending
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

  // Downloaded entries that need a published URL (we collect via state for now)
  const downloadedEntries = useMemo(
    () => allEntries.filter(e => e.status === "downloaded"),
    [allEntries]
  );

  const phase = useMemo<ProjectPhase>(() => {
    const approved = stats?.approvedKeywords ?? 0;
    const calendar = stats?.calendarEntries ?? 0;
    const generated = stats?.blogsGenerated ?? 0;
    if (approved === 0) return "new";
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
    <div className="space-y-8 pb-20 pl-4 pr-4 -mt-6 lg:-mt-8">
      {/* ── Sticky header ── */}
      <div className="sticky -top-6 lg:-top-8 z-20 -mx-6 lg:-mx-8 border-b border-border-subtle bg-surface-primary/95 backdrop-blur-sm px-6 lg:px-8 pb-5 pt-6 lg:pt-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11.5px] text-text-tertiary mb-1">
              <Link href="/projects" className="hover:text-text-secondary transition-colors">Projects</Link>
              <span className="opacity-40">/</span>
              <span className="text-text-secondary font-medium truncate">{project.name}</span>
              <span className="opacity-40">·</span>
              <Globe2 className="h-3 w-3" />
              <span className="font-mono">{project.domain}</span>
            </div>
            <h1 className="text-[26px] font-semibold tracking-[-0.02em] text-text-primary leading-tight truncate">
              {project.name}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ProjectNavLink
              href={`/projects/${id}/keywords`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface-elevated px-3.5 py-2 text-[13px] font-medium text-text-primary transition-all hover:-translate-y-0.5 hover:shadow-sm"
            >
              <Search className="h-3.5 w-3.5" /> Keywords
            </ProjectNavLink>
            <ProjectNavLink
              href={`/projects/${id}/content-generator`}
              className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-3.5 py-2 text-[13px] font-semibold text-surface-primary transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <Wand2 className="h-3.5 w-3.5" /> Generate
            </ProjectNavLink>
          </div>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <StatStrip projectId={id} stats={stats} />

      {/* ── AI Daily Brief ── */}
      <AIDailyBrief
        phase={phase}
        projectId={id}
        todayCount={todayEntries.length}
        approvedKeywords={stats?.approvedKeywords ?? 0}
        calendarEntries={stats?.calendarEntries ?? 0}
        generated={stats?.blogsGenerated ?? 0}
      />

      {/* ── Today's content ── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-brand-violet" />
              <h2 className="text-[16px] font-semibold text-text-primary">Today's content</h2>
              {todayEntries.length > 0 && (
                <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-brand-violet/15 text-[11px] font-bold text-brand-violet px-1.5">
                  {todayEntries.length}
                </span>
              )}
            </div>
            <p className="text-[12px] text-text-tertiary">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
          <ProjectNavLink
            href={`/projects/${id}/calendar`}
            className="text-[12.5px] font-medium text-brand-action hover:text-brand-action-hover transition-colors"
          >
            Open calendar →
          </ProjectNavLink>
        </div>

        {calLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-16 w-full rounded-xl border border-border-subtle bg-surface-elevated animate-pulse" />
            ))}
          </div>
        ) : todayEntries.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated divide-y divide-border-subtle">
            {todayEntries.map(entry => (
              <TodayEntryRow key={entry.id} entry={entry} projectId={id} />
            ))}
          </div>
        ) : (
          <EmptyToday projectId={id} phase={phase} />
        )}
      </section>

      {/* ── Downloaded → ask for published URL ── */}
      {downloadedEntries.length > 0 && (
        <DownloadedTracker entries={downloadedEntries} projectId={id} />
      )}

      {/* ── Upcoming content (next 7 days) ── */}
      {upcomingEntries.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[16px] font-semibold text-text-primary">Coming up this week</h2>
            <ProjectNavLink
              href={`/projects/${id}/calendar`}
              className="text-[12.5px] font-medium text-brand-action hover:text-brand-action-hover transition-colors"
            >
              View all →
            </ProjectNavLink>
          </div>
          <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated divide-y divide-border-subtle">
            {upcomingEntries.map(entry => (
              <UpcomingRow key={entry.id} entry={entry} projectId={id} />
            ))}
          </div>
        </section>
      )}

      {/* ── Quick actions ── */}
      <section>
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-text-tertiary mb-4">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            {
              href: `/projects/${id}/keywords`,
              icon: <Search className="h-4 w-4" />,
              label: "Keywords",
              sub: `${formatCompactNumber(stats?.approvedKeywords ?? 0)} approved`,
              color: "text-violet-500",
              bg: "bg-violet-500/10",
            },
            {
              href: `/projects/${id}/calendar`,
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
              href: `/projects/${id}/content-generator/history`,
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
              className="group flex flex-col gap-3 rounded-xl border border-border-subtle bg-surface-elevated p-4 transition-all hover:-translate-y-0.5 hover:border-border-default hover:shadow-sm"
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${item.bg} ${item.color}`}>
                {item.icon}
              </span>
              <div>
                <div className="text-[13.5px] font-semibold text-text-primary">{item.label}</div>
                <div className="text-[11.5px] text-text-tertiary mt-0.5">{item.sub}</div>
              </div>
            </ProjectNavLink>
          ))}
        </div>
      </section>

      {/* ── Content audit (coming soon) ── */}
      <section className="rounded-xl border border-dashed border-border-subtle bg-surface-secondary/30 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated text-text-tertiary">
            <AlertCircle className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-text-primary">Content Health Audit</span>
              <span className="inline-flex items-center rounded-full border border-border-subtle bg-surface-elevated px-2 py-0.5 text-[10px] font-semibold text-text-tertiary">
                Coming soon
              </span>
            </div>
            <p className="text-[12.5px] text-text-tertiary mt-0.5">
              Track live URL performance, surface decaying pages, and queue fixes automatically.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ─────────── StatStrip ─────────── */

function StatStrip({
  projectId,
  stats,
}: {
  projectId: string;
  stats?: { totalKeywords: number; approvedKeywords: number; calendarEntries: number; blogsGenerated: number } | undefined;
}) {
  const items = [
    { label: "Keywords approved", value: stats?.approvedKeywords, href: `/projects/${projectId}/keywords`, icon: <Search className="h-3.5 w-3.5" /> },
    { label: "Scheduled", value: stats?.calendarEntries, href: `/projects/${projectId}/calendar`, icon: <Calendar className="h-3.5 w-3.5" /> },
    { label: "Generated", value: stats?.blogsGenerated, href: `/projects/${projectId}/content-generator/history`, icon: <FileText className="h-3.5 w-3.5" /> },
    { label: "Total keywords", value: stats?.totalKeywords, href: `/projects/${projectId}/keywords`, icon: <Globe2 className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle md:grid-cols-4">
      {items.map(s => (
        <Link
          key={s.label}
          href={s.href}
          className="group flex flex-col gap-2 bg-surface-elevated p-4 transition-colors hover:bg-surface-hover"
        >
          <div className="flex items-center justify-between text-text-tertiary">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
              {s.icon} {s.label}
            </span>
            <ArrowRight className="h-3 w-3 opacity-0 transition-all group-hover:opacity-60" />
          </div>
          <div className="text-[24px] font-semibold tracking-tight tabular-nums text-text-primary">
            {s.value == null ? <Skeleton className="h-6 w-10" /> : formatCompactNumber(s.value)}
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ─────────── AI Daily Brief ─────────── */

const BRIEF_CONFIG: Record<
  ProjectPhase,
  { title: string; body: string; cta: string; href: (id: string) => string; icon: React.ReactNode }
> = {
  new: {
    title: "Start with keyword discovery",
    body: "Your project is set up. The first step is discovering which keywords your audience actually searches for — this drives everything else.",
    cta: "Discover keywords",
    href: id => `/projects/${id}/keywords`,
    icon: <Search className="h-5 w-5" />,
  },
  keywords: {
    title: "Schedule your approved keywords",
    body: "You've approved keywords. Next: move them onto the editorial calendar so the AI can queue content generation for you.",
    cta: "Open calendar",
    href: id => `/projects/${id}/calendar`,
    icon: <Calendar className="h-5 w-5" />,
  },
  schedule: {
    title: "Schedule your approved keywords",
    body: "Keywords are approved but nothing is on the calendar yet. Drop them into scheduled dates and we'll handle the generation queue.",
    cta: "Open calendar",
    href: id => `/projects/${id}/calendar`,
    icon: <Calendar className="h-5 w-5" />,
  },
  generate: {
    title: "Generate your first piece of content",
    body: "Content is scheduled. Go to the generator, pick a type (blog, ebook, LinkedIn), and let the AI draft it with your keyword and brief.",
    cta: "Open content studio",
    href: id => `/projects/${id}/content-generator`,
    icon: <Wand2 className="h-5 w-5" />,
  },
  active: {
    title: "Keep the pipeline moving",
    body: "Content is generating regularly. Download finished pieces, post them on your site, and keep the calendar full to compound your ranking growth.",
    cta: "Open calendar",
    href: id => `/projects/${id}/calendar`,
    icon: <Zap className="h-5 w-5" />,
  },
};

function AIDailyBrief({
  phase, projectId, todayCount, approvedKeywords, calendarEntries, generated,
}: {
  phase: ProjectPhase;
  projectId: string;
  todayCount: number;
  approvedKeywords: number;
  calendarEntries: number;
  generated: number;
}) {
  const cfg = BRIEF_CONFIG[todayCount > 0 ? "active" : phase];

  // Override message if there's content due today
  const title = todayCount > 0 ? `You have ${todayCount} piece${todayCount > 1 ? "s" : ""} scheduled for today` : cfg.title;
  const body = todayCount > 0
    ? `${todayCount > 1 ? "These are" : "This is"} ready to generate or download. Post them on your site to start building ranking momentum.`
    : cfg.body;

  return (
    <section className="relative overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-[240px] w-[240px] rounded-full bg-brand-violet/12 blur-[70px]" />
      <div className="relative flex flex-wrap items-start gap-5 p-5 sm:flex-nowrap">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-violet/30 bg-brand-violet/10 text-brand-violet">
          {todayCount > 0 ? <Sparkles className="h-5 w-5" /> : cfg.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="ai-orb" />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-brand-violet">
              Today's focus
            </span>
          </div>
          <h3 className="text-[17px] font-semibold tracking-tight text-text-primary leading-snug">{title}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-tertiary max-w-[640px]">{body}</p>
        </div>
        <ProjectNavLink
          href={todayCount > 0 ? `/projects/${projectId}/content-generator` : cfg.href(projectId)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-text-primary px-4 py-2 text-[13px] font-semibold text-surface-primary shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
          {todayCount > 0 ? "Generate now" : cfg.cta} <ArrowRight className="h-3.5 w-3.5" />
        </ProjectNavLink>
      </div>
    </section>
  );
}

/* ─────────── Today entry row ─────────── */

function TodayEntryRow({ entry, projectId }: { entry: CalendarEntryWithBlog; projectId: string }) {
  const blogId = entry.blog?.id;
  const tone: StatusTone = STATUS_TONE[entry.status] ?? "neutral";
  const label = STATUS_LABEL[entry.status] ?? entry.status;
  const needsGeneration = entry.status === "scheduled";
  const isReady = entry.status === "generated" || entry.status === "approved";
  const isDownloaded = entry.status === "downloaded" || entry.status === "published";

  return (
    <ProjectNavLink
      href={blogId ? `/projects/${projectId}/content-generator/blogs/${blogId}` : `/projects/${projectId}/content-generator`}
      className="group flex items-center gap-4 px-5 py-4 hover:bg-surface-hover transition-colors"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
        isDownloaded ? "bg-status-success/10 text-status-success border border-status-success/20" :
        isReady ? "bg-brand-violet/10 text-brand-violet border border-brand-violet/20" :
        "bg-surface-secondary text-text-tertiary border border-border-subtle"
      }`}>
        {isDownloaded ? <CheckCircle2 className="h-4 w-4" /> :
         isReady ? <Download className="h-4 w-4" /> :
         <Wand2 className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium text-text-primary">{entry.title}</p>
        <p className="mt-0.5 text-[12px] text-text-tertiary truncate">
          {entry.focus_keyword}
          {entry.article_type ? ` · ${entry.article_type}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <StatusBadge tone={tone} size="sm">{label}</StatusBadge>
        {needsGeneration && (
          <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-brand-violet/10 border border-brand-violet/20 px-2.5 py-1 text-[11.5px] font-medium text-brand-violet">
            <Wand2 className="h-3 w-3" /> Generate
          </span>
        )}
        <ChevronRight className="h-4 w-4 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </ProjectNavLink>
  );
}

/* ─────────── Upcoming row ─────────── */

function UpcomingRow({ entry, projectId }: { entry: CalendarEntryWithBlog; projectId: string }) {
  const blogId = entry.blog?.id;
  const tone: StatusTone = STATUS_TONE[entry.status] ?? "neutral";
  const label = STATUS_LABEL[entry.status] ?? entry.status;
  const dayLabel = formatDayLabel(entry.scheduled_date);

  return (
    <ProjectNavLink
      href={blogId ? `/projects/${projectId}/content-generator/blogs/${blogId}` : `/projects/${projectId}/calendar`}
      className="group flex items-center gap-4 px-5 py-3.5 hover:bg-surface-hover transition-colors"
    >
      <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border border-border-subtle bg-surface-secondary text-center">
        <span className="text-[9px] font-semibold uppercase leading-none text-text-tertiary">
          {new Date(entry.scheduled_date).toLocaleDateString("en-US", { month: "short" })}
        </span>
        <span className="mt-0.5 text-[15px] font-bold leading-none text-text-primary">
          {new Date(entry.scheduled_date).getDate()}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-text-primary">{entry.title}</p>
        <p className="mt-0.5 text-[11.5px] text-text-tertiary">
          {dayLabel} · {entry.focus_keyword}
        </p>
      </div>
      <StatusBadge tone={tone} size="sm">{label}</StatusBadge>
      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
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
    // For now just mark as saved — future: persist to backend
    setSaved(s => ({ ...s, [entryId]: true }));
  }

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-status-success" />
        <h2 className="text-[16px] font-semibold text-text-primary">Track what you've published</h2>
      </div>
      <p className="text-[12.5px] text-text-tertiary mb-4">
        You've downloaded {entries.length} piece{entries.length > 1 ? "s" : ""} of content. Add the URL where you posted it — we'll use this to track performance in future.
      </p>
      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-elevated divide-y divide-border-subtle">
        {entries.slice(0, 3).map(entry => (
          <div key={entry.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-medium text-text-primary">{entry.title}</p>
              <p className="mt-0.5 text-[11.5px] text-text-tertiary">{entry.focus_keyword}</p>
            </div>
            {saved[entry.id] ? (
              <span className="flex items-center gap-1.5 text-[12px] text-status-success font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> URL saved
              </span>
            ) : (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="url"
                  value={urls[entry.id] ?? ""}
                  onChange={e => setUrls(u => ({ ...u, [entry.id]: e.target.value }))}
                  placeholder="https://yoursite.com/your-post"
                  className="flex-1 sm:w-56 rounded-lg border border-border-default bg-surface-secondary px-3 py-1.5 text-[12.5px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-action focus:ring-1 focus:ring-brand-action/30"
                />
                <button
                  onClick={() => handleSave(entry.id)}
                  disabled={!urls[entry.id]?.trim()}
                  className="rounded-lg border border-border-default bg-surface-elevated px-3 py-1.5 text-[12.5px] font-medium text-text-primary hover:border-border-strong transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
  const messages: Record<ProjectPhase, { title: string; sub: string; cta: string; href: string }> = {
    new: {
      title: "Nothing scheduled today",
      sub: "Start by discovering keywords for your niche, then schedule them to the calendar.",
      cta: "Discover keywords",
      href: `/projects/${projectId}/keywords`,
    },
    keywords: {
      title: "Nothing scheduled today",
      sub: "You have approved keywords. Add them to the calendar to start generating content.",
      cta: "Open calendar",
      href: `/projects/${projectId}/calendar`,
    },
    schedule: {
      title: "Nothing scheduled today",
      sub: "No approved keywords yet. Discover and approve some so we can fill your calendar.",
      cta: "Discover keywords",
      href: `/projects/${projectId}/keywords`,
    },
    generate: {
      title: "Content is scheduled — not yet generated",
      sub: "Head to the content studio and generate the pieces in your calendar.",
      cta: "Open content studio",
      href: `/projects/${projectId}/content-generator`,
    },
    active: {
      title: "Nothing due today",
      sub: "Your calendar is active. Check upcoming content or add more keywords to keep the pipeline full.",
      cta: "Open calendar",
      href: `/projects/${projectId}/calendar`,
    },
  };

  const msg = messages[phase];

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border-default bg-surface-secondary/40 px-6 py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated text-brand-violet">
        <Calendar className="h-4 w-4" />
      </span>
      <div className="max-w-[400px]">
        <h3 className="text-[14.5px] font-semibold tracking-tight text-text-primary">{msg.title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-text-tertiary">{msg.sub}</p>
      </div>
      <ProjectNavLink
        href={msg.href}
        className="inline-flex items-center gap-1.5 rounded-full bg-text-primary px-4 py-2 text-[13px] font-semibold text-surface-primary"
      >
        {msg.cta} <ArrowRight className="h-3.5 w-3.5" />
      </ProjectNavLink>
    </div>
  );
}

/* ─────────── Skeleton ─────────── */

function OverviewSkeleton() {
  return (
    <div className="space-y-8 pb-20 pl-4 pr-4">
      <div className="pt-6">
        <Skeleton className="h-5 w-48 mb-2" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-px rounded-xl border border-border-subtle bg-border-subtle md:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-surface-elevated p-4 space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-6 w-12" />
          </div>
        ))}
      </div>
      <Skeleton className="h-28 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-5 w-40 mb-4" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    </div>
  );
}
