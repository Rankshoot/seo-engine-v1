"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { projectsApi } from "@/frontend/api/projects";
import { suggestProjectTargetingField } from "@/app/actions/project-actions";
import { TARGET_REGIONS, Project } from "@/lib/types";

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  editProject?: Project;
  onSaved?: () => void;
}

const FIELD =
  "w-full rounded-[8px] border border-border-subtle bg-surface-secondary px-3 py-2.5 text-[14px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-brand-action transition-colors appearance-none";

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-tertiary border border-border-subtle text-[10px] font-bold text-text-tertiary">
      {n}
    </span>
  );
}

function SectionLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <StepBadge n={n} />
      <p className="text-[12px] font-semibold text-text-secondary uppercase tracking-[0.6px]" style={{ fontFamily: "CohereMono, monospace" }}>
        {children}
      </p>
    </div>
  );
}

function Label({
  children,
  required,
  className = "",
}: {
  children: React.ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`block text-[12px] font-medium text-text-secondary mb-1.5 ${className}`}>
      {children}
      {required && <span className="ml-0.5 text-text-tertiary">*</span>}
    </label>
  );
}

/** Larger sparkle with fill + stroke so it reads clearly on dark UI. */
function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      fillOpacity={0.22}
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2.25l1.92 7.05L20.75 12l-6.83 2.7L12 21.75l-1.92-7.05L3.25 12l6.83-2.7L12 2.25z" />
    </svg>
  );
}

function AiFillLabelButton({
  busy,
  disabled,
  onClick,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title="Fill with AI using company, domain, and description"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand-action/40 bg-brand-action/12 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-brand-action shadow-[0_0_14px_rgba(255,255,255,0.06)] transition-all hover:border-brand-action/65 hover:bg-brand-action/20 hover:shadow-[0_0_18px_rgba(255,255,255,0.1)] disabled:pointer-events-none disabled:opacity-40"
    >
      {busy ? (
        <span className="h-[14px] w-[14px] animate-spin rounded-full border-2 border-brand-action/35 border-t-brand-action" />
      ) : (
        <SparkleIcon className="h-[14px] w-[14px] " />
      )}
      <span style={{ fontFamily: "CohereMono, monospace" }}>Ask AI</span>
    </button>
  );
}

function ModalContent({ onClose, editProject, onSaved }: { onClose: () => void; editProject?: Project; onSaved?: () => void; }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [niche, setNiche] = useState(editProject?.niche ?? "");
  const [targetAudience, setTargetAudience] = useState(editProject?.target_audience ?? "");
  const [aiLoading, setAiLoading] = useState<null | "niche" | "target_audience">(null);
  const [competitors, setCompetitors] = useState(editProject?.project_competitors?.length ? editProject.project_competitors.map(c => c.domain) : ["", ""]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const addCompetitor = () => setCompetitors(p => [...p, ""]);
  const updateCompetitor = (i: number, val: string) => setCompetitors(p => p.map((c, idx) => idx === i ? val : c));
  const removeCompetitor = (i: number) => setCompetitors(p => p.filter((_, idx) => idx !== i));

  async function runTargetingAiFill(field: "niche" | "target_audience") {
    setError("");
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    setAiLoading(field);
    try {
      const result = await suggestProjectTargetingField({
        field,
        company: String(fd.get("company") ?? ""),
        domain: String(fd.get("domain") ?? ""),
        description: String(fd.get("description") ?? ""),
      });
      console.log("[suggestProjectTargetingField]", result.trace);
      if (result.success) {
        if (field === "niche") setNiche(result.value);
        else setTargetAudience(result.value);
      } else {
        setError(result.error);
      }
    } finally {
      setAiLoading(null);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const result = await projectsApi.create({
      name: fd.get("name") as string,
      domain: fd.get("domain") as string,
      company: fd.get("company") as string,
      niche: fd.get("niche") as string,
      target_audience: fd.get("target_audience") as string,
      target_region: fd.get("target_region") as string,
      target_language: "en",
      description: fd.get("description") as string,
      competitors: competitors.filter(c => c.trim()),
      ahrefs_rank_tracker_project_id: null,
    });
    if (result.success && result.data) {
      router.push(`/projects/${result.data.id}/keywords`);
    } else {
      setError(result.error ?? "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-80 flex items-center justify-center p-4 bg-[#000000]/75 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full max-w-xl rounded-[16px] border border-border-subtle bg-surface-primary shadow-2xl flex flex-col"
        style={{ maxHeight: "calc(100vh - 40px)" }}
        onClick={e => e.stopPropagation()}
      >

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-6 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.8px] text-text-tertiary mb-0.5" style={{ fontFamily: "CohereMono, monospace" }}>
              New Project
            </p>
            <h2 className="text-[18px] font-semibold text-text-primary leading-tight">
              Set up your SEO campaign
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-tertiary hover:bg-surface-secondary hover:text-text-primary transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ──────────────────────────────────────────── */}
        <div ref={bodyRef} className="overflow-y-auto flex-1 px-6 py-5">
          <form ref={formRef} id="new-project-form" onSubmit={handleSubmit} className="space-y-7">

            {/* ── Section 1: Basic Info ─────────────────────────────── */}
            <div>
              <SectionLabel n={1}>Basic Info</SectionLabel>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label required>Project Name</Label>
                    <input name="name" required defaultValue={editProject?.name} placeholder="e.g. Main SEO Campaign" className={FIELD} />
                  </div>
                  <div>
                    <Label required>Company Name</Label>
                    <input name="company" required defaultValue={editProject?.company} placeholder="e.g. Acme Corp" className={FIELD} />
                  </div>
                </div>
                <div>
                  <Label required>Website Domain</Label>
                  <input name="domain" required defaultValue={editProject?.domain} placeholder="e.g. yourwebsite.com" className={FIELD} />
                </div>
                <div>
                  <Label>Description</Label>
                  <textarea name="description" rows={2} defaultValue={editProject?.description ?? ""} placeholder="Brief project notes…" className={`${FIELD} resize-none`} />
                </div>
              </div>
            </div>

            {/* ── Section 2: Targeting ──────────────────────────────── */}
            <div className="pt-2 border-t border-border-subtle">
              <SectionLabel n={2}>Targeting</SectionLabel>
              <div className="space-y-3">
                <div>
                  <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
                    <Label required className="mb-0 min-w-0 flex-1">
                      Niche / Industry
                    </Label>
                    <AiFillLabelButton
                      busy={aiLoading === "niche"}
                      disabled={loading}
                      onClick={() => void runTargetingAiFill("niche")}
                    />
                  </div>
                  <input
                    name="niche"
                    required
                    value={niche}
                    onChange={e => setNiche(e.target.value)}
                    placeholder="e.g. HR Software, Digital Marketing, Fitness Apps"
                    className={FIELD}
                  />
                  <p className="mt-1 text-[11px] text-text-tertiary">This drives keyword discovery — be specific.</p>
                </div>
                <div>
                  <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
                    <Label required className="mb-0 min-w-0 flex-1">
                      Target Audience
                    </Label>
                    <AiFillLabelButton
                      busy={aiLoading === "target_audience"}
                      disabled={loading}
                      onClick={() => void runTargetingAiFill("target_audience")}
                    />
                  </div>
                  <input
                    name="target_audience"
                    required
                    value={targetAudience}
                    onChange={e => setTargetAudience(e.target.value)}
                    placeholder="e.g. HR managers at mid-size companies"
                    className={FIELD}
                  />
                </div>
                <div>
                  <Label required>Target Region</Label>
                  <div className="relative">
                    <select name="target_region" className={FIELD} defaultValue={editProject?.target_region ?? "us"}>
                      {TARGET_REGIONS.map(r => (
                        <option key={r.code} value={r.code}>{r.name}</option>
                      ))}
                    </select>
                    <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section 3: Competitors ────────────────────────────── */}
            <div className="pt-2 border-t border-border-subtle">
              <div className="flex items-center justify-between mb-4">
                <SectionLabel n={3}>
                  Competitors <span className="text-text-tertiary font-normal normal-case tracking-normal ml-1">(optional)</span>
                </SectionLabel>
                <button
                  type="button"
                  onClick={addCompetitor}
                  className="text-[12px] font-medium text-brand-action hover:opacity-80 transition-opacity"
                >
                  + Add
                </button>
              </div>
              <p className="text-[12px] text-text-tertiary mb-3 -mt-2">Helps us find content gaps and relevant keywords.</p>
              <div className="space-y-2">
                {competitors.map((comp, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={comp}
                      onChange={e => updateCompetitor(i, e.target.value)}
                      placeholder={`competitor${i + 1}.com`}
                      className={`${FIELD} flex-1`}
                    />
                    {competitors.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCompetitor(i)}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-text-tertiary hover:bg-rose-500/10 hover:text-rose-400 transition-colors"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </form>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border-subtle px-6 py-4 space-y-3">
          {error && (
            <div className="flex items-start gap-2.5 rounded-[8px] border border-rose-500/20 bg-rose-500/8 px-3.5 py-3 text-[13px] text-rose-400">
              <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="h-10 rounded-[32px] border border-border-subtle px-5 text-[13px] font-medium text-text-tertiary hover:text-text-primary hover:bg-surface-secondary transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              form="new-project-form"
              type="submit"
              disabled={loading}
              className="flex flex-1 h-10 items-center justify-center gap-2.5 rounded-[32px] bg-brand-primary text-[13px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-brand-on-primary/30 border-t-brand-on-primary" />
                  {editProject ? "Saving..." : "Creating project…"}
                </>
              ) : (
                <>
                  Create Project &amp; Discover Keywords
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

export function NewProjectModal({ open, onClose, editProject, onSaved }: NewProjectModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!mounted || !open) return null;
  return createPortal(<ModalContent onClose={onClose} editProject={editProject} onSaved={onSaved} />, document.body);
}
