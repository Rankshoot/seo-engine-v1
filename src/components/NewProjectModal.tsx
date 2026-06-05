"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { projectsApi } from "@/frontend/api/projects";
import { suggestProjectTargetingField } from "@/app/actions/project-actions";
import { TARGET_REGIONS, type Project } from "@/lib/types";
import {
  Dialog,
  Button,
  IconButton,
  Field,
  Label,
  Input,
  Textarea,
  Select,
  Spinner,
} from "@/components/common";

interface NewProjectModalProps {
  open: boolean;
  onClose: () => void;
  editProject?: Project;
  onSaved?: () => void;
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-tertiary text-[10px] font-bold text-text-tertiary">
      {n}
    </span>
  );
}

function SectionLabel({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <StepBadge n={n} />
      <p
        className="text-[12px] font-semibold uppercase tracking-[0.6px] text-text-secondary"
        style={{ fontFamily: "CohereMono, monospace" }}
      >
        {children}
      </p>
    </div>
  );
}

/** "Ask AI" pill — opinionated micro-button that's not generic enough for the common library. */
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
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand-action/40 bg-brand-action/12 px-2 py-0.5 text-[11px] font-semibold tracking-wide text-brand-action transition-all duration-(--duration-fast) ease-out hover:border-brand-action/65 hover:bg-brand-action/20 disabled:pointer-events-none disabled:opacity-40"
    >
      {busy ? (
        <Spinner size={12} className="text-brand-action" />
      ) : (
        <svg
          className="h-3.5 w-3.5"
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
      )}
      <span style={{ fontFamily: "CohereMono, monospace" }}>Ask AI</span>
    </button>
  );
}

export function NewProjectModal({ open, onClose, editProject, onSaved }: NewProjectModalProps) {
  const router = useRouter();
  const formId = useRef(`project-form-${Math.random().toString(36).slice(2)}`).current;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [niche, setNiche] = useState(editProject?.niche ?? "");
  const [targetAudience, setTargetAudience] = useState(editProject?.target_audience ?? "");
  const [brandVoice, setBrandVoice] = useState(editProject?.brand_voice ?? "");
  const [brandValues, setBrandValues] = useState(editProject?.brand_values ?? "");
  const [brandDescription, setBrandDescription] = useState(editProject?.brand_description ?? "");
  const [aiLoading, setAiLoading] = useState<null | "niche" | "target_audience" | "brand_voice" | "brand_values" | "brand_description">(null);
  const [competitors, setCompetitors] = useState<string[]>(
    editProject?.project_competitors?.length
      ? editProject.project_competitors.map(c => c.domain)
      : ["", ""],
  );
  const formRef = useRef<HTMLFormElement>(null);

  const addCompetitor = () => setCompetitors(p => [...p, ""]);
  const updateCompetitor = (i: number, val: string) =>
    setCompetitors(p => p.map((c, idx) => (idx === i ? val : c)));
  const removeCompetitor = (i: number) =>
    setCompetitors(p => p.filter((_, idx) => idx !== i));

  async function runTargetingAiFill(field: "niche" | "target_audience" | "brand_voice" | "brand_values" | "brand_description") {
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
        else if (field === "target_audience") setTargetAudience(result.value);
        else if (field === "brand_voice") setBrandVoice(result.value);
        else if (field === "brand_values") setBrandValues(result.value);
        else if (field === "brand_description") setBrandDescription(result.value);
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
    const payload = {
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
      brand_voice: fd.get("brand_voice") as string,
      brand_values: fd.get("brand_values") as string,
      brand_description: fd.get("brand_description") as string,
    };

    if (editProject) {
      const result = await projectsApi.update(editProject.id, payload);
      if (result.success && result.data) {
        onSaved?.();
      } else {
        setError(result.error ?? "Something went wrong");
        setLoading(false);
      }
    } else {
      const result = await projectsApi.create(payload);
      if (result.success && result.data) {
        onSaved?.();
        router.push(`/projects/${result.data.id}/keywords`);
      } else {
        setError(result.error ?? "Something went wrong");
        setLoading(false);
      }
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
      title={
        <div>
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.8px] text-text-tertiary"
            style={{ fontFamily: "CohereMono, monospace" }}
          >
            {editProject ? "Edit Project" : "New Project"}
          </p>
          <span className="mt-0.5 block text-[18px] font-semibold text-text-primary">
            {editProject ? "Update your campaign" : "Set up your SEO campaign"}
          </span>
        </div>
      }
      footer={
        <>
          <Button onClick={onClose} variant="ghost" disabled={loading}>
            Cancel
          </Button>
          <Button
            form={formId}
            type="submit"
            variant="primary"
            size="md"
            loading={loading}
            disabled={loading}
            iconRight={
              !loading ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              ) : undefined
            }
          >
            {loading
              ? editProject
                ? "Saving…"
                : "Creating project…"
              : editProject
                ? "Save changes"
                : "Create Project & Discover Keywords"}
          </Button>
        </>
      }
    >
      <form ref={formRef} id={formId} onSubmit={handleSubmit} className="space-y-7">
        {/* ── Section 1: Basic Info ─────────────────────────────── */}
        <div>
          <SectionLabel n={1}>Basic Info</SectionLabel>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Project Name" required htmlFor="np-name">
                <Input
                  id="np-name"
                  name="name"
                  required
                  defaultValue={editProject?.name}
                  placeholder="e.g. Main SEO Campaign"
                />
              </Field>
              <Field label="Company Name" required htmlFor="np-company">
                <Input
                  id="np-company"
                  name="company"
                  required
                  defaultValue={editProject?.company}
                  placeholder="e.g. Acme Corp"
                />
              </Field>
            </div>
            <Field label="Website Domain" required htmlFor="np-domain">
              <Input
                id="np-domain"
                name="domain"
                required
                defaultValue={editProject?.domain}
                placeholder="e.g. yourwebsite.com"
              />
            </Field>
          </div>
        </div>

        {/* ── Section 2: Targeting ──────────────────────────────── */}
        <div className="border-t border-border-subtle pt-2">
          <SectionLabel n={2}>Targeting</SectionLabel>
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
                <Label htmlFor="np-niche" required className="min-w-0 flex-1">
                  Niche / Industry
                </Label>
                <AiFillLabelButton
                  busy={aiLoading === "niche"}
                  disabled={loading}
                  onClick={() => void runTargetingAiFill("niche")}
                />
              </div>
              <Input
                id="np-niche"
                name="niche"
                required
                value={niche}
                onChange={e => setNiche(e.target.value)}
                placeholder="e.g. HR Software, Digital Marketing, Fitness Apps"
              />
              <p className="mt-1 text-[11px] text-text-tertiary">
                This drives keyword discovery — be specific.
              </p>
            </div>
            <div>
              <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
                <Label htmlFor="np-audience" required className="min-w-0 flex-1">
                  Target Audience
                </Label>
                <AiFillLabelButton
                  busy={aiLoading === "target_audience"}
                  disabled={loading}
                  onClick={() => void runTargetingAiFill("target_audience")}
                />
              </div>
              <Input
                id="np-audience"
                name="target_audience"
                required
                value={targetAudience}
                onChange={e => setTargetAudience(e.target.value)}
                placeholder="e.g. HR managers at mid-size companies"
              />
            </div>
            <Field label="Target Region" required htmlFor="np-region">
              <Select id="np-region" name="target_region" defaultValue={editProject?.target_region ?? "us"}>
                {TARGET_REGIONS.map(r => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        {/* ── Section 3: Competitors ────────────────────────────── */}
        <div className="border-t border-border-subtle pt-2">
          <div className="mb-4 flex items-center justify-between">
            <SectionLabel n={3}>
              Competitors{" "}
              <span className="ml-1 font-normal normal-case tracking-normal text-text-tertiary">
                (optional)
              </span>
            </SectionLabel>
            <button
              type="button"
              onClick={addCompetitor}
              className="text-[12px] font-medium text-brand-action transition-opacity hover:opacity-80"
            >
              + Add
            </button>
          </div>
          <p className="-mt-2 mb-3 text-[12px] text-text-tertiary">
            Helps us find content gaps and relevant keywords.
          </p>
          <div className="space-y-2">
            {competitors.map((comp, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={comp}
                  onChange={e => updateCompetitor(i, e.target.value)}
                  placeholder={`competitor${i + 1}.com`}
                  className="flex-1"
                />
                {competitors.length > 1 && (
                  <IconButton
                    aria-label="Remove competitor"
                    onClick={() => removeCompetitor(i)}
                    size="sm"
                    variant="ghost"
                    className="hover:bg-rose-500/10 hover:text-rose-400"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </IconButton>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 4: Brand Persona ──────────────────────────── */}
        <div className="border-t border-border-subtle pt-2">
          <SectionLabel n={4}>
            Brand Persona{" "}
            <span className="ml-1 font-normal normal-case tracking-normal text-text-tertiary">
              (optional)
            </span>
          </SectionLabel>
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
                <Label htmlFor="np-brand-voice" className="min-w-0 flex-1">
                  Brand Voice / Tone
                </Label>
                <AiFillLabelButton
                  busy={aiLoading === "brand_voice"}
                  disabled={loading}
                  onClick={() => void runTargetingAiFill("brand_voice")}
                />
              </div>
              <Input
                id="np-brand-voice"
                name="brand_voice"
                value={brandVoice}
                onChange={e => setBrandVoice(e.target.value)}
                placeholder="e.g. professional, authoritative, warm, witty"
              />
              <p className="mt-1 text-[11px] text-text-tertiary">
                Adjectives describing how your brand sounds to others.
              </p>
            </div>

            <div>
              <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
                <Label htmlFor="np-brand-values" className="min-w-0 flex-1">
                  Core Values / Messaging
                </Label>
                <AiFillLabelButton
                  busy={aiLoading === "brand_values"}
                  disabled={loading}
                  onClick={() => void runTargetingAiFill("brand_values")}
                />
              </div>
              <Input
                id="np-brand-values"
                name="brand_values"
                value={brandValues}
                onChange={e => setBrandValues(e.target.value)}
                placeholder="e.g. customer-first, sustainability, transparency"
              />
              <p className="mt-1 text-[11px] text-text-tertiary">
                Key principles or messaging themes driving your brand.
              </p>
            </div>

            <div>
              <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
                <Label htmlFor="np-brand-desc" className="min-w-0 flex-1">
                  Brand Personality / Description
                </Label>
                <AiFillLabelButton
                  busy={aiLoading === "brand_description"}
                  disabled={loading}
                  onClick={() => void runTargetingAiFill("brand_description")}
                />
              </div>
              <Textarea
                id="np-brand-desc"
                name="brand_description"
                rows={2}
                value={brandDescription}
                onChange={e => setBrandDescription(e.target.value)}
                placeholder="e.g. An expert advisor explaining complex concepts simply without jargon."
                className="resize-none"
              />
              <p className="mt-1 text-[11px] text-text-tertiary">
                Brief description of your brand's character or persona.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-md border border-rose-500/20 bg-rose-500/10 px-3.5 py-3 text-[13px] text-rose-400">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            {error}
          </div>
        )}
      </form>
    </Dialog>
  );
}
