"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Project, ProjectCompetitor, TARGET_REGIONS } from "@/lib/types";
import { projectDomainHost } from "@/lib/project-domain-host";
import { PROJECT_CARD_GRID_HEIGHT_CLASS } from "@/components/dashboard/project-card-layout";
import {
  deleteProject,
  getProject,
  updateProject,
} from "@/app/actions/project-actions";

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
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-700 to-zinc-900 text-lg font-bold tracking-tight text-zinc-200 ring-1 ring-inset ring-white/10"
        aria-hidden
      >
        {letter}
      </div>
    );
  }

  return (
    <div
      className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-inset ring-zinc-200/80 shadow-sm"
      aria-hidden
    >
      <img
        key={`${host}-${index}`}
        src={sources[index]}
        alt=""
        width={44}
        height={44}
        loading="lazy"
        decoding="async"
        className="h-9 w-9 object-contain"
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

/** ISO 3166-1 alpha-2 for flagcdn (UK → gb). */
function regionToFlagIso(regionCode: string): string | null {
  const c = regionCode.trim().toLowerCase();
  const known = new Set<string>(TARGET_REGIONS.map(r => r.code as string));
  if (!known.has(c)) return null;
  return c === "uk" ? "gb" : c;
}

/** Short label under flag (e.g. US, UAE). */
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
    <div className="flex flex-col items-center gap-1" title={full}>
      {iso ? (
        <img
          src={`https://flagcdn.com/w40/${iso}.png`}
          srcSet={`https://flagcdn.com/w20/${iso}.png 1x, https://flagcdn.com/w40/${iso}.png 2x`}
          width={22}
          height={16}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-4 w-[22px] rounded-sm object-cover shadow-sm ring-1 ring-black/25 dark:ring-white/15"
          onError={e => {
            (e.target as HTMLImageElement).style.visibility = "hidden";
          }}
        />
      ) : (
        <span className="flex h-4 w-[22px] items-center justify-center rounded-sm bg-surface-elevated text-[8px] font-bold text-text-tertiary ring-1 ring-border-subtle">
          {short.slice(0, 2)}
        </span>
      )}
      <span className="max-w-[52px] truncate text-center text-[9px] font-bold uppercase tracking-wide text-text-tertiary">
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
  const descRaw = project.description?.trim() ?? "";
  const descriptionSnippet =
    descRaw.length > 120 ? `${descRaw.slice(0, 120)}…` : descRaw;

  const metaBlock =
    descriptionSnippet ||
    (project.target_audience?.trim()
      ? `Audience — ${project.target_audience.trim()}`
      : "");

  return (
    <>
      <div className={`relative group ${PROJECT_CARD_GRID_HEIGHT_CLASS}`}>
        <Link
          href={`/projects/${project.id}`}
          className={`group/card relative flex ${PROJECT_CARD_GRID_HEIGHT_CLASS} flex-col overflow-hidden rounded-2xl border border-border-subtle/90 bg-gradient-to-b from-surface-elevated/40 via-surface-secondary/80 to-surface-secondary p-5 shadow-sm shadow-black/20 transition-all duration-300 hover:-translate-y-0.5 hover:border-border-default hover:shadow-lg hover:shadow-black/30`}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent opacity-0 transition-opacity duration-300 group-hover/card:opacity-100" />

          <div className="flex min-h-0 flex-1 gap-4">
            <div className="flex w-[52px] shrink-0 flex-col items-center gap-2">
              <ProjectDomainLogo domain={project.domain} fallbackLetter={project.company || project.name} />
              <RegionBelowAvatar regionCode={project.target_region} />
            </div>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col pr-9">
              <h3 className="text-[15px] font-bold leading-snug tracking-tight text-text-primary transition-colors group-hover/card:text-brand-300">
                {project.name}
              </h3>

              {companyLine ? (
                <p className="mt-0.5 truncate text-xs font-medium text-text-secondary">{companyLine}</p>
              ) : null}

              <p className="mt-1 font-mono text-[11px] leading-relaxed text-text-tertiary" title={project.domain}>
                {host || project.domain}
              </p>

              <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-relaxed text-text-tertiary/90">
                {project.niche}
              </p>

              {/* <p
                className={`mt-2 line-clamp-3 min-h-16.5 border-l-2 border-brand-500/35 pl-2.5 text-[11px] leading-relaxed ${
                  metaBlock ? "text-text-tertiary/85" : "text-text-tertiary/35"
                }`}
              >
                {metaBlock || "\u00a0"}
              </p> */}
            </div>
          </div>

          <div className="mt-auto flex shrink-0 items-center justify-between border-t border-border-subtle/80 pt-3">
            <span className="text-[11px] text-text-tertiary">
              Added{" "}
              {new Date(project.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-400 transition-transform group-hover/card:translate-x-0.5">
              Open workspace
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </span>
          </div>
        </Link>

        {/* Kebab menu — absolute so it sits on top of the Link without
            breaking navigation when the user clicks the card body. */}
        <div className="absolute top-4 right-4" ref={menuRef}>
          <button
            type="button"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(v => !v);
            }}
            aria-label="Project menu"
            className="w-8 h-8 rounded-lg bg-surface-elevated/80 hover:bg-surface-elevated border border-border-subtle text-text-tertiary hover:text-text-primary flex items-center justify-center transition-colors backdrop-blur-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-10 z-20 w-44 rounded-xl border border-border-subtle bg-surface-secondary shadow-2xl shadow-black/40 backdrop-blur-xl overflow-hidden">
              <button
                type="button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-text-secondary hover:bg-glass hover:text-text-primary transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
                className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-bold text-rose-400 hover:bg-rose-500/10 transition-colors border-t border-border-subtle"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
    // Pull full project + competitors so the edit form is pre-filled with
    // everything, not just the columns on the list query.
    let cancelled = false;
    (async () => {
      const res = await getProject(projectId);
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
    const res = await updateProject(projectId, {
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
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-11 w-full animate-pulse rounded-xl bg-surface-elevated" />
          ))}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              className="input-field w-full"
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-text-secondary">
                Competitors <span className="text-text-tertiary font-normal">(optional)</span>
              </label>
              <button
                type="button"
                onClick={addCompetitor}
                className="text-xs font-bold text-brand-400 hover:text-brand-300 transition-colors"
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {competitors.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={c}
                    onChange={e => updateCompetitor(i, e.target.value)}
                    placeholder={`competitor${i + 1}.com`}
                    className="input-field flex-1"
                  />
                  {competitors.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => removeCompetitor(i)}
                      className="w-8 h-8 rounded-lg hover:bg-rose-500/10 text-text-tertiary hover:text-rose-400 flex items-center justify-center transition-colors"
                      aria-label="Remove competitor"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-400">
              {error}
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border-subtle bg-surface-elevated px-4 py-2.5 text-xs font-bold text-text-secondary hover:border-border-default transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-brand-500 hover:bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-500/20 hover:-translate-y-0.5 transition-all disabled:opacity-60"
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
    const res = await deleteProject(project.id);
    if (res.success) onDeleted();
    else {
      setError(res.error ?? "Failed to delete project.");
      setDeleting(false);
    }
  };

  return (
    <ModalShell onClose={onClose} title="Delete project" danger>
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          This will permanently delete <span className="font-bold text-text-primary">{project.name}</span> along with
          every keyword, calendar entry, blog draft, audit, and competitor benchmark tied to it. This can't be undone.
        </p>
        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-1.5">
            Type <span className="font-black text-rose-400">{project.name}</span> to confirm
          </label>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            className="input-field w-full"
            autoFocus
          />
        </div>
        {error ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-400">
            {error}
          </div>
        ) : null}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border-subtle bg-surface-elevated px-4 py-2.5 text-xs font-bold text-text-secondary hover:border-border-default transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!matches || deleting}
            className="rounded-xl bg-rose-500 hover:bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-rose-500/20 hover:-translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
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
      <label className="block text-xs font-semibold text-text-secondary mb-1.5">
        {label}
        {optional ? <span className="ml-1 text-text-tertiary font-normal">(optional)</span> : null}
      </label>
      {children}
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  danger,
  children,
}: {
  title: string;
  onClose: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close modal"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      {/* Panel */}
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border-subtle bg-surface-secondary shadow-2xl shadow-black/50"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-6 py-4">
          <h2 className={`text-lg font-bold ${danger ? "text-rose-400" : "text-text-primary"}`}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-glass flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
