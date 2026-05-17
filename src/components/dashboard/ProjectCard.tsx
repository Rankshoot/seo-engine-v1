"use client";

import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Project, ProjectCompetitor, TARGET_REGIONS } from "@/lib/types";
import { projectDomainHost } from "@/lib/project-domain-host";
import { projectsApi } from "@/frontend/api/projects";
import { NewProjectModal } from "@/components/NewProjectModal";
import { useClickOutside } from "@/hooks/useClickOutside";
import { ArrowRight, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";

/** Shared with `ProjectsClient` for dashed “new project” tiles in the same grid. */
export const PROJECT_CARD_GRID_HEIGHT_CLASS = "min-h-[200px] h-full";

interface ProjectCardProps {
  project: Project;
}

function logoUrlCandidates(host: string): string[] {
  if (!host) return [];
  return [
    `https://logo.clearbit.com/${encodeURIComponent(host)}`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,
  ];
}

function ProjectDomainLogo({
  domain,
  fallbackLetter,
}: {
  domain: string;
  fallbackLetter: string;
}) {
  const host = useMemo(() => projectDomainHost(domain), [domain]);
  const sources = useMemo(() => logoUrlCandidates(host), [host]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [host]);

  const letter = (fallbackLetter || "?").charAt(0).toUpperCase();

  if (!host || failed) {
    return (
      <div
        className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-[8px] bg-surface-tertiary text-[18px] font-medium text-text-primary border border-border-subtle"
        aria-hidden
      >
        {letter}
      </div>
    );
  }

  return (
    <div
      className="relative flex h-[48px] w-[48px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-white border border-[#e5e7eb]"
      aria-hidden
    >
      <img
        key={`${host}-${index}`}
        src={sources[index]}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        className="h-8 w-8 object-contain"
        onError={() => {
          if (index < sources.length - 1) setIndex(i => i + 1);
          else setFailed(true);
        }}
      />
    </div>
  );
}

function regionLabel(code: string): string {
  const row = TARGET_REGIONS.find(r => r.code === code.toLowerCase());
  return row?.name ?? code.toUpperCase();
}

function regionToFlagIso(regionCode: string): string | null {
  const c = regionCode.trim().toLowerCase();
  const known = new Set<string>(TARGET_REGIONS.map(r => r.code as string));
  if (!known.has(c)) return null;
  return c === "uk" ? "gb" : c;
}

function regionShortLabel(regionCode: string): string {
  const c = regionCode.trim().toLowerCase();
  const short: Record<string, string> = {
    us: "US",
    uk: "UK",
    in: "IN",
    au: "AU",
    ca: "CA",
    de: "DE",
    fr: "FR",
    sg: "SG",
    ae: "UAE",
    nz: "NZ",
  };
  return short[c] ?? regionCode.slice(0, 3).toUpperCase();
}

function RegionBelowAvatar({ regionCode }: { regionCode: string }) {
  const iso = regionToFlagIso(regionCode);
  const short = regionShortLabel(regionCode);
  const full = regionLabel(regionCode);
  return (
    <div className="flex flex-col items-center gap-1.5 mt-2" title={full}>
      {iso ? (
        <img
          src={`https://flagcdn.com/w40/${iso}.png`}
          srcSet={`https://flagcdn.com/w20/${iso}.png 1x, https://flagcdn.com/w40/${iso}.png 2x`}
          width={24}
          height={18}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-[14px] w-[20px] rounded-[2px] object-cover border border-black/10 dark:border-white/10"
          onError={e => {
            (e.target as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      ) : (
        <span className="flex h-[14px] w-[20px] items-center justify-center rounded-[2px] bg-surface-tertiary text-[9px] font-bold text-text-tertiary border border-border-subtle">
          {short.slice(0, 2)}
        </span>
      )}
      <span className="max-w-[48px] truncate text-center font-mono text-[10px] uppercase tracking-widest text-text-tertiary">
        {short}
      </span>
    </div>
  );
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);
  useEffect(() => {
    if (!menuOpen) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [menuOpen]);

  const host = projectDomainHost(project.domain);
  const companyLine =
    project.company?.trim() &&
    project.company.trim().toLowerCase() !== project.name.trim().toLowerCase()
      ? project.company.trim()
      : null;

  return (
    <>
      <div className={`relative group ${PROJECT_CARD_GRID_HEIGHT_CLASS}`}>
        <ProjectNavLink
          href={`/projects/${project.id}`}
          className={`group/card relative flex ${PROJECT_CARD_GRID_HEIGHT_CLASS} flex-col overflow-hidden rounded-card border border-border-subtle bg-surface-elevated p-6 transition-all duration-(--duration-base) hover:-translate-y-0.5 hover:border-border-default hover:shadow-(--shadow-md)`}
        >
          {/* AI accent line on hover */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-violet/60 to-transparent opacity-0 transition-opacity duration-(--duration-base) group-hover/card:opacity-100"
          />
          {/* AI glow on hover */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 h-[200px] w-[200px] rounded-full bg-brand-violet/10 blur-[60px] opacity-0 transition-opacity duration-(--duration-slow) group-hover/card:opacity-100"
          />

          <div className="relative flex min-h-0 flex-1 gap-5">
            <div className="flex w-[48px] shrink-0 flex-col items-center">
              <ProjectDomainLogo domain={project.domain} fallbackLetter={project.company || project.name} />
              <RegionBelowAvatar regionCode={project.target_region} />
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col pr-8">
              <h3 className="text-[17px] font-semibold leading-snug tracking-tight text-text-primary transition-colors group-hover/card:text-brand-violet">
                {project.name}
              </h3>

              {companyLine ? (
                <p className="mt-1 truncate text-[13px] text-text-secondary">{companyLine}</p>
              ) : null}

              <p className="mt-1.5 font-mono text-[11.5px] text-text-tertiary" title={project.domain}>
                {host || project.domain}
              </p>

              <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-text-tertiary">
                {project.niche}
              </p>
            </div>
          </div>

          <div className="relative mt-auto flex shrink-0 items-center justify-between border-t border-border-subtle pt-4">
            <span className="text-[11.5px] text-text-tertiary">
              Added{" "}
              {new Date(project.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-brand-violet transition-transform group-hover/card:translate-x-0.5">
              Open workspace <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
        </ProjectNavLink>

        {/* Kebab menu */}
        <div className="absolute top-4 right-4" ref={menuRef}>
          <button
            type="button"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(v => !v);
            }}
            aria-label="Project menu"
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-tertiary hover:text-text-primary"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-lg border border-border-subtle bg-surface-elevated shadow-(--shadow-md)">
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-hover"
              >
                <Pencil className="h-3.5 w-3.5 text-text-tertiary" />
                Edit details
              </button>
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(false);
                  setDeleteOpen(true);
                }}
                className="flex w-full items-center gap-2.5 border-t border-border-subtle px-3 py-2 text-[13px] font-medium text-status-danger transition-colors hover:bg-status-danger/5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete project
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {editOpen ? (
        <NewProjectModal
          open={editOpen}
          editProject={project}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      {deleteOpen ? (
        <DeleteProjectModal
          project={project}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            setDeleteOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete confirmation
// ─────────────────────────────────────────────────────────────────────────────

function DeleteProjectModal({
  project,
  onClose,
  onDeleted,
}: {
  project: Project;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const matches = confirmText.trim().toLowerCase() === project.name.trim().toLowerCase();

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    const res = await projectsApi.delete(project.id);
    if (res.success) onDeleted();
    else {
      setError(res.error ?? "Failed to delete project.");
      setDeleting(false);
    }
  };

  return (
    <ModalShell onClose={onClose} title="Delete project">
      <div className="space-y-5">
        <p className="text-[14px] leading-relaxed text-text-secondary">
          This will permanently delete{" "}
          <span className="font-semibold text-text-primary">{project.name}</span> along with every keyword,
          calendar entry, blog draft, audit, and competitor benchmark tied to it. This can&apos;t be undone.
        </p>
        <div>
          <label className="mb-2 block text-[13px] font-medium text-text-primary">
            Type <span className="font-bold text-status-danger">{project.name}</span> to confirm
          </label>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            className="input-field w-full"
            autoFocus
          />
        </div>
        {error ? (
          <div className="rounded-lg border border-status-danger/20 bg-status-danger/5 p-3 text-[13px] text-status-danger">
            {error}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2 border-t border-border-subtle pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!matches || deleting}
            className="rounded-full bg-status-danger px-5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleting ? "Deleting…" : "Delete project"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared shell
// ─────────────────────────────────────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close modal"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />
      <div
        className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-card border border-border-subtle bg-surface-elevated shadow-(--shadow-xl)"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-5">
          <h2 className="text-[18px] font-semibold tracking-tight text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
