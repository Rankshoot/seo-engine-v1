"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import ProjectCard from "@/components/dashboard/ProjectCard";
import { NewProjectModal } from "@/components/NewProjectModal";
import type { Project } from "@/lib/types";
import { Button } from "@/components/common";
import { useDebounce } from "@/hooks/useDebounce";
import { formatRelativeTime } from "@/utils/format";
import { BRAND } from "@/constants/brand";
import {
  ArrowRight, FolderPlus, Search, Sparkles, Plus,
  BarChart3, Zap, Clock, Globe2,
} from "lucide-react";
import { useUserQuota } from "@/hooks/useUserQuota";
import { Logo } from "@/components/brand/Logo";
import {
  AuthUserButton as UserButton,
} from "@/components/auth-wrapper";
import { ThemeToggle } from "@/components/theme-toggle";
import { useScrolledPast } from "@/hooks/useScrollPosition";

/* ── Greeting helper ── */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/* ── Top nav ── */
function DashboardNav({ onNewProject, canCreate }: { onNewProject: () => void; canCreate: boolean }) {
  const scrolled = useScrolledPast(20);

  return (
    <nav className="sticky top-0 z-40 flex justify-center px-4 pt-3 pb-1">
      <div
        className={`flex w-full max-w-[1320px] items-center justify-between transition-all duration-400 ease-out ${
          scrolled
            ? "rounded-full border border-border-subtle bg-glass px-5 py-2.5 shadow-[0_6px_28px_rgba(0,0,0,0.10)] dark:shadow-[0_6px_28px_rgba(0,0,0,0.36)] backdrop-blur-md"
            : "rounded-none border-transparent bg-transparent px-1 py-2"
        }`}
      >
        <Link href="/" className="group shrink-0">
          <span className="inline-block transition-transform duration-200 group-hover:scale-[1.03]" style={{ transformOrigin: "left center" }}>
            <Logo size="sm" priority />
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={onNewProject}
            disabled={!canCreate}
            title={!canCreate ? "Upgrade to create more projects" : undefined}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-violet px-4 py-2 text-[13px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-action-hover hover:shadow-[var(--shadow-glow-md)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> New project
          </button>
          <UserButton />
        </div>
      </div>
    </nav>
  );
}

/* ── Main export ── */
export default function ProjectsClient({
  projects,
  initialNewModalOpen = false,
  newProjectModalOpen: controlledOpen,
  onNewProjectModalOpenChange,
  userName = "",
}: {
  projects: Project[];
  initialNewModalOpen?: boolean;
  newProjectModalOpen?: boolean;
  onNewProjectModalOpenChange?: (open: boolean) => void;
  userName?: string;
}) {
  const isControlled =
    typeof controlledOpen === "boolean" && typeof onNewProjectModalOpenChange === "function";
  const [uncontrolledOpen, setUncontrolledOpen] = useState(initialNewModalOpen);
  const modalOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const setModalOpen = useCallback(
    (v: boolean) => {
      if (isControlled) onNewProjectModalOpenChange!(v);
      else setUncontrolledOpen(v);
    },
    [isControlled, onNewProjectModalOpenChange],
  );
  const openModal = useCallback(() => setModalOpen(true), [setModalOpen]);
  const closeModal = useCallback(() => setModalOpen(false), [setModalOpen]);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 150);
  const { canCreateProject } = useUserQuota();

  const firstName = useMemo(() => userName?.split(" ")[0] ?? "", [userName]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(p =>
      `${p.name} ${p.company ?? ""} ${p.domain ?? ""} ${p.niche ?? ""}`.toLowerCase().includes(q),
    );
  }, [projects, debouncedQuery]);

  const mostRecent = useMemo(() => {
    if (projects.length === 0) return null;
    return [...projects].sort((a, b) => {
      const da = new Date(a.updated_at || a.created_at).getTime();
      const db = new Date(b.updated_at || b.created_at).getTime();
      return db - da;
    })[0];
  }, [projects]);

  return (
    <>
      {/* Background ambient */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[900px] rounded-full bg-brand-violet/12 dark:bg-brand-violet/7 blur-[130px]" />
        <div className="absolute bottom-[-80px] right-[10%] h-[350px] w-[400px] rounded-full bg-brand-aqua/8 dark:bg-brand-aqua/5 blur-[100px]" />
      </div>

      {/* Floating nav */}
      <DashboardNav onNewProject={openModal} canCreate={canCreateProject} />

      <div className="mx-auto max-w-[1320px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pt-10">

        {/* ── Greeting header ─────────────────────────────────── */}
        <header className="mb-10">
          <p className="text-[13px] font-medium text-text-tertiary">
            {getGreeting()}{firstName ? `, ${firstName}` : ""} — here's your workspace
          </p>
          <h1 className="mt-1.5 text-[36px] font-semibold tracking-[-0.028em] leading-[1.05] sm:text-[42px]">
            Your projects
          </h1>

          {/* Quick stats row */}
          {projects.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-3">
              <StatPill icon={<Globe2 className="h-3.5 w-3.5" />} value={`${projects.length}`} label="projects" />
              {mostRecent && (
                <StatPill
                  icon={<Clock className="h-3.5 w-3.5" />}
                  value={formatRelativeTime(mostRecent.updated_at || mostRecent.created_at)}
                  label="last activity"
                />
              )}
              <StatPill icon={<Zap className="h-3.5 w-3.5" />} value="AI" label="auto-brief on every project" />
            </div>
          )}
        </header>

        {/* ── Resume banner ──────────────────────────────────── */}
        {mostRecent && projects.length > 0 && (
          <ResumeBanner project={mostRecent} className="mb-8" />
        )}

        {/* ── Search + grid ──────────────────────────────────── */}
        {projects.length > 0 ? (
          <section>
            {/* Filter bar */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full max-w-[400px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search by name, domain, or niche…"
                  className="w-full rounded-full border border-border-subtle bg-surface-elevated py-2.5 pl-9 pr-4 text-[13px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand-action focus:ring-2 focus:ring-brand-action/20"
                />
              </div>
              <span className="text-[12px] text-text-tertiary">
                {filtered.length} of {projects.length}
              </span>
            </div>

            {filtered.length > 0 ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map(project => (
                  <ProjectCard key={project.id} project={project} />
                ))}
                {/* + New project tile at end of grid */}
                {canCreateProject && (
                  <button
                    type="button"
                    onClick={openModal}
                    className="group relative flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-[16px] border-2 border-dashed border-border-subtle bg-surface-secondary/30 transition-all duration-200 hover:border-brand-violet/40 hover:bg-brand-violet/5 hover:-translate-y-0.5"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-surface-elevated text-text-tertiary shadow-[var(--shadow-xs)] transition-all duration-200 group-hover:border-brand-violet/40 group-hover:bg-brand-violet/10 group-hover:text-brand-violet">
                      <Plus className="h-5 w-5" />
                    </div>
                    <span className="text-[13px] font-medium text-text-tertiary transition-colors group-hover:text-brand-violet">
                      New project
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <NoSearchResults query={debouncedQuery} onClear={() => setQuery("")} />
            )}
          </section>
        ) : (
          <EmptyState onCreate={openModal} canCreateProject={canCreateProject} />
        )}
      </div>

      <NewProjectModal open={modalOpen} onClose={closeModal} />
    </>
  );
}

/* ── Stat pill ── */
function StatPill({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-3.5 py-1.5 text-[12.5px] shadow-[var(--shadow-xs)]">
      <span className="text-brand-violet">{icon}</span>
      <span className="font-semibold text-text-primary">{value}</span>
      <span className="text-text-tertiary">{label}</span>
    </div>
  );
}

/* ── Resume banner ── */
function ResumeBanner({ project, className }: { project: Project; className?: string }) {
  return (
    <section
      className={`relative overflow-hidden rounded-[20px] border border-border-subtle bg-surface-elevated shadow-[var(--shadow-sm)] transition-all duration-200 hover:shadow-[var(--shadow-md)] ${className ?? ""}`}
    >
      {/* Glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-[320px] w-[320px] rounded-full bg-brand-violet/14 blur-[90px]"
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-violet/50 to-transparent" />

      <div className="relative flex flex-wrap items-center gap-5 px-7 py-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-brand-violet/25 bg-brand-violet/10 text-brand-violet shadow-[var(--shadow-glow-sm)]">
          <Sparkles className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-brand-violet">
            Pick up where you left off
          </div>
          <h3 className="mt-1 text-[18px] font-semibold tracking-tight text-text-primary">
            {project.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-text-tertiary">
            <span>Last active {formatRelativeTime(project.updated_at || project.created_at)}</span>
            {project.domain && (
              <>
                <span className="opacity-40">·</span>
                <span className="font-mono">{project.domain}</span>
              </>
            )}
          </div>
        </div>

        <Link
          href={`/projects/${project.id}`}
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-text-primary px-5 py-2.5 text-[13.5px] font-semibold text-surface-primary shadow-[var(--shadow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
        >
          Open workspace <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}

/* ── Empty state ── */
function EmptyState({ onCreate, canCreateProject }: { onCreate: () => void; canCreateProject: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-border-subtle bg-surface-elevated px-6 py-20 text-center shadow-[var(--shadow-sm)] sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[640px] -translate-x-1/2 rounded-full bg-brand-violet/12 blur-[120px]"
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-violet/40 to-transparent" />

      <div className="relative mx-auto max-w-[480px]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-border-subtle bg-surface-secondary text-brand-violet shadow-[var(--shadow-glow-sm)]">
          <FolderPlus className="h-7 w-7" />
        </div>
        <h2 className="mt-8 text-[26px] font-semibold tracking-tight text-text-primary">
          Create your first project
        </h2>
        <p className="mx-auto mt-3 max-w-[380px] text-[14.5px] leading-relaxed text-text-secondary">
          A project holds your entire SEO campaign — brief, keywords, 30-day calendar, AI content, and health audits — all in one place.
        </p>

        <div className="mt-8 flex justify-center">
          <button
            onClick={onCreate}
            disabled={!canCreateProject}
            title={!canCreateProject ? "You've reached your project limit. Upgrade to create more." : undefined}
            className="inline-flex items-center gap-2 rounded-full bg-brand-violet px-6 py-3 text-[14px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-action-hover hover:shadow-[var(--shadow-glow-md)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Create project <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-auto mt-12 grid max-w-[560px] grid-cols-3 gap-px overflow-hidden rounded-[16px] border border-border-subtle bg-border-subtle text-left">
          {[
            { num: "01", label: "Drop your domain + 2–3 competitors" },
            { num: "02", label: "AI briefs your business automatically" },
            { num: "03", label: "Approve keywords, publish content" },
          ].map(s => (
            <div key={s.num} className="bg-surface-elevated px-4 py-5">
              <div className="font-mono text-[10px] font-bold text-text-tertiary">{s.num}</div>
              <div className="mt-2 text-[12.5px] font-medium leading-relaxed text-text-primary">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── No results ── */
function NoSearchResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-[20px] border border-dashed border-border-default bg-surface-secondary/40 px-6 py-16 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated text-text-tertiary shadow-[var(--shadow-xs)]">
        <Search className="h-4.5 w-4.5" />
      </span>
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-text-primary">
          No projects match &ldquo;{query}&rdquo;
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-tertiary">Try a different name, domain, or niche.</p>
      </div>
      <button
        onClick={onClear}
        className="rounded-full border border-border-default bg-surface-elevated px-4 py-2 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-hover"
      >
        Clear search
      </button>
    </div>
  );
}
