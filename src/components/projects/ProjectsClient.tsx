"use client";

import { useMemo, useState, useCallback } from "react";
import ProjectCard from "@/components/dashboard/ProjectCard";
import { NewProjectModal } from "@/components/NewProjectModal";
import type { Project } from "@/lib/types";
import { Button } from "@/components/common";
import { useDebounce } from "@/hooks/useDebounce";
import { formatRelativeTime } from "@/utils/format";
import { BRAND } from "@/constants/brand";
import { ArrowRight, FolderPlus, Search, Sparkles } from "lucide-react";
import { useUserQuota } from "@/hooks/useUserQuota";

export default function ProjectsClient({
  projects,
  initialNewModalOpen = false,
  newProjectModalOpen: controlledOpen,
  onNewProjectModalOpenChange,
}: {
  projects: Project[];
  /** Used only when the modal is uncontrolled (no parent passes open/setter). */
  initialNewModalOpen?: boolean;
  newProjectModalOpen?: boolean;
  onNewProjectModalOpenChange?: (open: boolean) => void;
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
      <div className="space-y-10 pb-20">
        {/* ── Header ──────────────────────────────────────────── */}
        <header className="flex flex-col gap-6 pt-4 pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
              <span className="ai-orb" /> Workspace
            </div>
            <h1 className="mt-4 text-[40px] font-semibold tracking-[-0.025em] leading-[1.05]">
              Your {BRAND.name} projects
            </h1>
            <p className="mt-3 max-w-[620px] text-[15px] leading-relaxed text-text-secondary">
              Each project is a self-contained SEO campaign — its own brief, keyword set, calendar, blogs, and audits. Spin up as many as you need.
            </p>
          </div>
          <Button
            onClick={openModal}
            variant="primary"
            size="lg"
            shape="pill"
            className="shrink-0"
            iconLeft={<FolderPlus className="h-3.5 w-3.5" />}
            disabled={!canCreateProject}
            title={!canCreateProject ? "You've reached your project limit. Upgrade your plan to create more." : undefined}
          >
            New project
          </Button>
        </header>

        {/* ── Most-recent quick resume ────────────────────────── */}
        {mostRecent && (
          <ResumeBanner project={mostRecent} />
        )}

        {/* ── Filter bar ──────────────────────────────────────── */}
        {projects.length > 0 && (
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-[420px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-tertiary" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search projects by name, domain, or niche…"
                className="w-full rounded-full border border-border-subtle bg-surface-elevated py-2 pl-9 pr-4 text-[13px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand-action focus:ring-2 focus:ring-brand-action/20"
              />
            </div>
            <span className="text-[12px] text-text-tertiary">
              {filtered.length} of {projects.length}
            </span>
          </div>
        )}

        {/* ── Grid ────────────────────────────────────────────── */}
        {projects.length > 0 ? (
          filtered.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map(project => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <NoSearchResults query={debouncedQuery} onClear={() => setQuery("")} />
          )
        ) : (
          <EmptyState onCreate={openModal} canCreateProject={canCreateProject} />
        )}
      </div>

      <NewProjectModal open={modalOpen} onClose={closeModal} />
    </>
  );
}

function ResumeBanner({ project }: { project: Project }) {
  return (
    <section className="relative overflow-hidden rounded-card border border-border-subtle bg-surface-elevated">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-20 h-[280px] w-[280px] rounded-full bg-brand-violet/12 blur-[80px]"
      />
      <div className="relative flex flex-wrap items-center gap-6 p-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-secondary text-brand-violet shadow-(--shadow-glow-sm)">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-violet">
            Pick up where you left off
          </div>
          <h3 className="mt-1.5 text-[18px] font-semibold tracking-tight text-text-primary">
            {project.name}
          </h3>
          <p className="mt-1 text-[12.5px] text-text-tertiary">
            Last touched {formatRelativeTime(project.updated_at || project.created_at)} ·{" "}
            <span className="font-mono">{project.domain}</span>
          </p>
        </div>
        <a
          href={`/projects/${project.id}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-text-primary px-4 py-2 text-[13px] font-semibold text-surface-primary shadow-(--shadow-sm) transition-all duration-(--duration-fast) hover:-translate-y-0.5 hover:shadow-(--shadow-md)"
        >
          Open workspace <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>
    </section>
  );
}

function EmptyState({ onCreate, canCreateProject }: { onCreate: () => void; canCreateProject: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-card border border-border-subtle bg-surface-elevated p-16 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[640px] -translate-x-1/2 rounded-full bg-brand-violet/12 blur-[120px]"
      />
      <div className="relative">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border-subtle bg-surface-secondary text-brand-violet shadow-(--shadow-glow-sm)">
          <FolderPlus className="h-5 w-5" />
        </div>
        <h2 className="mt-6 text-[22px] font-semibold tracking-tight text-text-primary">
          Create your first project
        </h2>
        <p className="mx-auto mt-3 max-w-[460px] text-[14px] leading-relaxed text-text-tertiary">
          A project holds everything for one SEO campaign — your brief, keyword set, 30-day calendar, AI-generated content, and Content Health audits. You can spin up as many as you need.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <Button
            onClick={onCreate}
            variant="primary"
            size="lg"
            shape="pill"
            iconRight={<ArrowRight className="h-3.5 w-3.5" />}
            disabled={!canCreateProject}
            title={!canCreateProject ? "You've reached your project limit. Upgrade your plan to create more." : undefined}
          >
            Create project
          </Button>
        </div>
        <div className="mx-auto mt-10 grid max-w-[640px] grid-cols-3 gap-px overflow-hidden rounded-xl border border-border-subtle bg-border-subtle text-left">
          {[
            { num: "01", label: "Drop your domain + competitors" },
            { num: "02", label: "Rankshoot briefs your business automatically" },
            { num: "03", label: "Approve keywords, ship content" },
          ].map(step => (
            <div key={step.num} className="bg-surface-elevated p-4">
              <div className="font-mono text-[10.5px] text-text-tertiary">{step.num}</div>
              <div className="mt-1.5 text-[12.5px] font-medium text-text-primary">{step.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NoSearchResults({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card border border-dashed border-border-strong bg-surface-secondary/40 p-12 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-subtle bg-surface-elevated text-text-tertiary">
        <Search className="h-4 w-4" />
      </span>
      <div className="max-w-[420px]">
        <h3 className="text-[15px] font-semibold tracking-tight text-text-primary">
          No projects match &quot;{query}&quot;
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-text-tertiary">
          Try a different name, domain, or niche.
        </p>
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
