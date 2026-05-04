"use client";

import { ProjectNavLink } from "@/components/ProjectNavLink";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Project, ProjectCompetitor, TARGET_REGIONS } from "@/lib/types";
import { projectDomainHost } from "@/lib/project-domain-host";
import { projectsApi } from "@/frontend/api/projects";

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

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
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
          className={`group/card relative flex ${PROJECT_CARD_GRID_HEIGHT_CLASS} flex-col overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated p-6 transition-all duration-300 hover:border-border-strong hover:shadow-sm`}
        >
          <div className="flex min-h-0 flex-1 gap-5">
            <div className="flex w-[48px] shrink-0 flex-col items-center">
              <ProjectDomainLogo domain={project.domain} fallbackLetter={project.company || project.name} />
              <RegionBelowAvatar regionCode={project.target_region} />
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col pr-8">
              <h3 className="text-[18px] font-medium leading-snug text-text-primary transition-colors group-hover/card:text-brand-action">
                {project.name}
              </h3>

              {companyLine ? (
                <p className="mt-1 truncate text-[14px] text-text-secondary">{companyLine}</p>
              ) : null}

              <p className="mt-1.5 font-mono text-[12px] text-text-tertiary" title={project.domain}>
                {host || project.domain}
              </p>

              <p className="mt-3 line-clamp-2 text-[14px] leading-relaxed text-text-secondary">
                {project.niche}
              </p>
            </div>
          </div>

          <div className="mt-auto flex shrink-0 items-center justify-between border-t border-border-subtle pt-4">
            <span className="text-[12px] text-text-tertiary">
              Added{" "}
              {new Date(project.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[14px] font-medium text-brand-action transition-transform group-hover/card:translate-x-1">
              Open workspace
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </span>
          </div>
        </ProjectNavLink>

        {/* Kebab menu */}
        <div className="absolute top-5 right-5" ref={menuRef}>
          <button
            type="button"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(v => !v);
            }}
            aria-label="Project menu"
            className="w-8 h-8 rounded-[4px] bg-transparent hover:bg-surface-tertiary text-text-tertiary hover:text-text-primary flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="19" cy="12" r="1.5" />
            </svg>
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-10 z-20 w-48 rounded-[8px] border border-border-subtle bg-surface-elevated shadow-lg overflow-hidden">
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 text-[14px] font-medium text-text-primary hover:bg-surface-hover transition-colors"
              >
                <svg className="w-4 h-4 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487z" />
                </svg>
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
                className="w-full flex items-center gap-3 px-4 py-3 text-[14px] font-medium text-[#b30000] hover:bg-[#b30000]/5 transition-colors border-t border-border-subtle"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
                Delete project
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {editOpen ? (
        <EditProjectModal
          projectId={project.id}
          fallback={project}
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
// Edit modal
// ─────────────────────────────────────────────────────────────────────────────

function EditProjectModal({
  projectId,
  fallback,
  onClose,
  onSaved,
}: {
  projectId: string;
  fallback: Project;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: fallback.name,
    domain: fallback.domain,
    company: fallback.company,
    niche: fallback.niche,
    target_audience: fallback.target_audience,
    target_region: fallback.target_region,
    description: fallback.description ?? "",
  });
  const [competitors, setCompetitors] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await projectsApi.get(projectId);
      if (cancelled) return;
      if (res.success && res.data) {
        const p = res.data;
        setForm({
          name: p.name,
          domain: p.domain,
          company: p.company,
          niche: p.niche,
          target_audience: p.target_audience,
          target_region: p.target_region,
          description: p.description ?? "",
        });
        const existing = (p.project_competitors ?? []).map((c: ProjectCompetitor) => c.domain);
        setCompetitors(existing.length ? existing : [""]);
      } else {
        setCompetitors([""]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  const updateField = (k: keyof typeof form, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const updateCompetitor = (i: number, v: string) =>
    setCompetitors(prev => prev.map((c, idx) => (idx === i ? v : c)));
  const addCompetitor = () => setCompetitors(prev => [...prev, ""]);
  const removeCompetitor = (i: number) =>
    setCompetitors(prev => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await projectsApi.update(projectId, {
      ...form,
      competitors: competitors.map(c => c.trim()).filter(Boolean),
    });
    if (res.success) {
      onSaved();
    } else {
      setError(res.error ?? "Failed to save project.");
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} title="Edit project">
      {loading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 w-full animate-pulse rounded-[8px] bg-surface-tertiary" />
          ))}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Project name">
              <input
                required
                value={form.name}
                onChange={e => updateField("name", e.target.value)}
                className="input-field w-full"
              />
            </Field>
            <Field label="Company">
              <input
                required
                value={form.company}
                onChange={e => updateField("company", e.target.value)}
                className="input-field w-full"
              />
            </Field>
          </div>

          <Field label="Website domain">
            <input
              required
              value={form.domain}
              onChange={e => updateField("domain", e.target.value)}
              className="input-field w-full font-mono text-[14px]"
            />
          </Field>

          <Field label="Niche / industry">
            <input
              required
              value={form.niche}
              onChange={e => updateField("niche", e.target.value)}
              className="input-field w-full"
            />
          </Field>

          <Field label="Target audience">
            <input
              required
              value={form.target_audience}
              onChange={e => updateField("target_audience", e.target.value)}
              className="input-field w-full"
            />
          </Field>

          <Field label="Target region">
            <select
              value={form.target_region}
              onChange={e => updateField("target_region", e.target.value)}
              className="input-field w-full"
            >
              {TARGET_REGIONS.map(r => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Description" optional>
            <textarea
              rows={2}
              value={form.description}
              onChange={e => updateField("description", e.target.value)}
              className="input-field w-full resize-none"
            />
          </Field>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[14px] font-medium text-text-primary">
                Competitors <span className="text-text-tertiary font-normal">(optional)</span>
              </label>
              <button
                type="button"
                onClick={addCompetitor}
                className="text-[14px] font-medium text-brand-action hover:underline"
              >
                + Add
              </button>
            </div>
            <div className="space-y-3">
              {competitors.map((c, i) => (
                <div key={i} className="flex items-center gap-3">
                  <input
                    value={c}
                    onChange={e => updateCompetitor(i, e.target.value)}
                    placeholder={`competitor${i + 1}.com`}
                    className="input-field flex-1 font-mono text-[14px]"
                  />
                  {competitors.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeCompetitor(i)}
                      className="w-10 h-10 rounded-[8px] hover:bg-surface-tertiary text-text-tertiary hover:text-[#b30000] flex items-center justify-center transition-colors"
                      aria-label="Remove competitor"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {error ? (
            <div className="rounded-[8px] border border-[#b30000]/20 bg-[#b30000]/5 p-4 text-[14px] text-[#b30000]">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[4px] px-4 py-2 text-[14px] text-text-primary hover:underline"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-[32px] bg-brand-primary px-6 py-2.5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </ModalShell>
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
      <div className="space-y-6">
        <p className="text-[16px] text-text-secondary leading-relaxed">
          This will permanently delete <span className="font-medium text-text-primary">{project.name}</span> along with
          every keyword, calendar entry, blog draft, audit, and competitor benchmark tied to it. This can't be undone.
        </p>
        <div>
          <label className="block text-[14px] font-medium text-text-primary mb-2">
            Type <span className="font-bold text-[#b30000]">{project.name}</span> to confirm
          </label>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            className="input-field w-full"
            autoFocus
          />
        </div>
        {error ? (
          <div className="rounded-[8px] border border-[#b30000]/20 bg-[#b30000]/5 p-4 text-[14px] text-[#b30000]">
            {error}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-subtle">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[4px] px-4 py-2 text-[14px] text-text-primary hover:underline"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!matches || deleting}
            className="rounded-[32px] bg-[#b30000] px-6 py-2.5 text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
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

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[14px] font-medium text-text-primary mb-2">
        {label}
        {optional ? <span className="ml-1.5 text-text-tertiary font-normal">(optional)</span> : null}
      </label>
      {children}
    </div>
  );
}

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
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close modal"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
      />
      {/* Panel */}
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[22px] border border-border-subtle bg-surface-primary shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-8 py-6">
          <h2 className="text-[24px] font-normal tracking-tight text-text-primary font-display">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-10 h-10 rounded-[8px] text-text-tertiary hover:text-text-primary hover:bg-surface-tertiary flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-8">{children}</div>
      </div>
    </div>
  );
}
