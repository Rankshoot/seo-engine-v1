"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { projectsApi } from "@/frontend/api/projects";
import { suggestProjectTargetingField } from "@/app/actions/project-actions";
import { TARGET_REGIONS } from "@/lib/types";
import { ArrowRight, ArrowLeft, Plus, X, Sparkles, Globe2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Spinner } from "@/components/common";

interface ProjectDraft {
  name: string;
  company: string;
  domain: string;
  target_region: string;
  niche: string;
  target_audience: string;
  competitors: string[];
  description: string;
  brand_voice: string;
  brand_description: string;
}

const TOTAL_STEPS = 5;

export function OnboardingFlow({ userName }: { userName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProjectDraft>({
    name: "",
    company: "",
    domain: "",
    target_region: "us",
    niche: "",
    target_audience: "",
    competitors: ["", ""],
    description: "",
    brand_voice: "",
    brand_description: "",
  });

  function update<K extends keyof ProjectDraft>(field: K, value: ProjectDraft[K]) {
    setDraft(d => ({ ...d, [field]: value }));
  }

  function transition(toStep: number) {
    setVisible(false);
    setTimeout(() => {
      setStep(toStep);
      setVisible(true);
    }, 180);
  }

  function goNext() { if (step < TOTAL_STEPS) transition(step + 1); }
  function goBack() { if (step > 0) transition(step - 1); }

  async function fillWithAi(field: "niche" | "target_audience" | "brand_voice" | "brand_description") {
    setAiLoading(field);
    try {
      const res = await suggestProjectTargetingField({
        field,
        company: draft.company,
        domain: draft.domain,
        description: draft.description,
      });
      if (res.success) update(field, res.value);
    } finally {
      setAiLoading(null);
    }
  }

  async function handleCreate() {
    setCreating(true);
    setError("");
    try {
      const res = await projectsApi.create({
        name: draft.name.trim() || draft.company.trim(),
        domain: draft.domain.trim(),
        company: draft.company.trim(),
        niche: draft.niche,
        target_audience: draft.target_audience,
        target_region: draft.target_region,
        target_language: "en",
        description: draft.description,
        competitors: draft.competitors.filter(c => c.trim()),
        brand_voice: draft.brand_voice,
        brand_values: "",
        brand_description: draft.brand_description,
      });
      if (res.success && res.data) {
        router.push(`/projects/${res.data.id}/keywords`);
      } else {
        setError(res.error ?? "Something went wrong. Please try again.");
        setCreating(false);
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setCreating(false);
    }
  }

  const sharedProps = { draft, update, onNext: goNext, onBack: goBack };

  return (
    <div className="relative min-h-screen bg-surface-primary flex flex-col">
      {/* Background glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[1000px] rounded-full bg-brand-violet/10 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[500px] rounded-full bg-brand-aqua/6 blur-[120px]" />
      </div>

      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle/60">
        <Logo size="sm" />
        {step > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-text-tertiary hidden sm:block">
              Step {step} of {TOTAL_STEPS}
            </span>
            <div className="w-28 h-1.5 bg-surface-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-violet rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* Step area */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div
          className={`w-full max-w-[500px] transition-all duration-200 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          {step === 0 && <StepWelcome userName={userName} onStart={goNext} />}
          {step === 1 && <StepBasicInfo {...sharedProps} />}
          {step === 2 && <StepDomainRegion {...sharedProps} />}
          {step === 3 && <StepNicheAudience {...sharedProps} aiLoading={aiLoading} onAiFill={fillWithAi} />}
          {step === 4 && <StepCompetitors {...sharedProps} />}
          {step === 5 && (
            <StepBrandVoice
              {...sharedProps}
              aiLoading={aiLoading}
              onAiFill={fillWithAi}
              onCreate={handleCreate}
              creating={creating}
              error={error}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────── Step 0: Welcome ──────────── */

function StepWelcome({ userName, onStart }: { userName: string; onStart: () => void }) {
  const firstName = userName.split(" ")[0];
  return (
    <div className="text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary mb-8">
        <span className="ai-orb" /> Your AI SEO workspace
      </div>

      <h1 className="text-[40px] font-semibold tracking-[-0.03em] leading-[1.05] text-text-primary">
        {firstName ? `Hey ${firstName} 👋` : "Welcome 👋"}
      </h1>
      <p className="mt-4 text-[16px] leading-relaxed text-text-secondary max-w-[380px] mx-auto">
        Let's set up your first project. In about 2 minutes you'll have
        curated keyword opportunities ready to publish.
      </p>

      <div className="mt-8 grid grid-cols-3 gap-3 text-left">
        {[
          { emoji: "🔍", title: "Keywords", desc: "Real search demand, intent-classified" },
          { emoji: "📅", title: "Calendar", desc: "Content plan, auto-filled from your keywords" },
          { emoji: "✍️", title: "Generate", desc: "Blogs, ebooks, LinkedIn posts — AI-written" },
        ].map(item => (
          <div
            key={item.title}
            className="rounded-xl border border-border-subtle bg-surface-elevated p-3.5"
          >
            <div className="text-[20px] mb-2">{item.emoji}</div>
            <div className="text-[13px] font-semibold text-text-primary">{item.title}</div>
            <div className="mt-0.5 text-[11.5px] text-text-tertiary leading-snug">{item.desc}</div>
          </div>
        ))}
      </div>

      <button
        onClick={onStart}
        className="mt-8 w-full inline-flex items-center justify-center gap-2 rounded-full bg-text-primary px-6 py-3.5 text-[15px] font-semibold text-surface-primary shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
      >
        Let's get started <ArrowRight className="h-4 w-4" />
      </button>

      <p className="mt-4 text-[12px] text-text-tertiary">No credit card needed to explore</p>
    </div>
  );
}

/* ──────────── Step 1: Project name & company ──────────── */

function StepBasicInfo({
  draft, update, onNext, onBack,
}: StepProps) {
  const canContinue = draft.name.trim() && draft.company.trim();

  return (
    <div>
      <StepHeader
        num={1}
        title="Name your campaign"
        sub="What's the project called and which company is this for?"
      />
      <div className="space-y-4">
        <FormField label="Project name" required>
          <input
            autoFocus
            type="text"
            value={draft.name}
            onChange={e => update("name", e.target.value)}
            onKeyDown={e => e.key === "Enter" && canContinue && onNext()}
            placeholder="e.g. Main SEO Campaign"
            className={inputCls}
          />
        </FormField>
        <FormField label="Company name" required>
          <input
            type="text"
            value={draft.company}
            onChange={e => update("company", e.target.value)}
            onKeyDown={e => e.key === "Enter" && canContinue && onNext()}
            placeholder="e.g. Acme Corp"
            className={inputCls}
          />
        </FormField>
      </div>
      <StepNav onBack={onBack} onNext={onNext} disabled={!canContinue} />
    </div>
  );
}

/* ──────────── Step 2: Domain & region ──────────── */

function StepDomainRegion({ draft, update, onNext, onBack }: StepProps) {
  const canContinue = draft.domain.trim();

  return (
    <div>
      <StepHeader
        num={2}
        title="Your website"
        sub="We'll use your domain and region to find the most relevant keyword opportunities."
      />
      <div className="space-y-4">
        <FormField label="Website domain" required hint="Just the domain — no https:// needed">
          <div className="relative">
            <Globe2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
            <input
              autoFocus
              type="text"
              value={draft.domain}
              onChange={e => update("domain", e.target.value)}
              onKeyDown={e => e.key === "Enter" && canContinue && onNext()}
              placeholder="yourwebsite.com"
              className={`${inputCls} pl-10`}
            />
          </div>
        </FormField>

        <FormField label="Target region" required hint="Primary market you're writing content for">
          <select
            value={draft.target_region}
            onChange={e => update("target_region", e.target.value)}
            className={inputCls}
          >
            {TARGET_REGIONS.map(r => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Short description" hint="Optional — helps AI generate better keyword suggestions">
          <textarea
            value={draft.description}
            onChange={e => update("description", e.target.value)}
            placeholder="What does your company do? Who are your customers? (2–3 sentences)"
            rows={3}
            className={`${inputCls} resize-none`}
          />
        </FormField>
      </div>
      <StepNav onBack={onBack} onNext={onNext} disabled={!canContinue} />
    </div>
  );
}

/* ──────────── Step 3: Niche & audience ──────────── */

function StepNicheAudience({
  draft, update, onNext, onBack, aiLoading, onAiFill,
}: StepProps & AiProps) {
  const canContinue = draft.niche.trim();

  return (
    <div>
      <StepHeader
        num={3}
        title="Industry & audience"
        sub="These are fed directly into our keyword engine — keep them concise for the best results."
      />

      <InfoTip>
        <strong>Tip:</strong> Use 1–3 word descriptions for niche (e.g. "SaaS HR software") and audience (e.g. "HR managers at SMBs") — this dramatically improves keyword relevance.
      </InfoTip>

      <div className="space-y-4">
        <FormField label="Niche / Industry" required hint="Your primary market category">
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={draft.niche}
              onChange={e => update("niche", e.target.value)}
              onKeyDown={e => e.key === "Enter" && canContinue && onNext()}
              placeholder="e.g. SaaS HR software"
              className={`${inputCls} flex-1`}
            />
            <AiButton busy={aiLoading === "niche"} onClick={() => onAiFill("niche")} disabled={!draft.company && !draft.domain} />
          </div>
        </FormField>

        <FormField label="Target audience" hint="Who are you writing content for?">
          <div className="flex gap-2">
            <input
              type="text"
              value={draft.target_audience}
              onChange={e => update("target_audience", e.target.value)}
              placeholder="e.g. HR managers at mid-size companies"
              className={`${inputCls} flex-1`}
            />
            <AiButton busy={aiLoading === "target_audience"} onClick={() => onAiFill("target_audience")} disabled={!draft.niche} />
          </div>
        </FormField>
      </div>
      <StepNav onBack={onBack} onNext={onNext} disabled={!canContinue} />
    </div>
  );
}

/* ──────────── Step 4: Competitors ──────────── */

function StepCompetitors({ draft, update, onNext, onBack }: StepProps) {
  function updateCompetitor(i: number, val: string) {
    const next = [...draft.competitors];
    next[i] = val;
    update("competitors", next);
  }
  function addCompetitor() {
    update("competitors", [...draft.competitors, ""]);
  }
  function removeCompetitor(i: number) {
    update("competitors", draft.competitors.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <StepHeader
        num={4}
        title="Who are your competitors?"
        sub="Optional but powerful — we'll find keywords they rank for that you can steal."
      />

      <InfoTip>
        <strong>How we use this:</strong> We analyze competitor rankings to surface keyword gaps — pages they rank for that you don't. You can skip this and add competitors later.
      </InfoTip>

      <div className="space-y-2.5">
        {draft.competitors.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Globe2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
              <input
                type="text"
                value={c}
                onChange={e => updateCompetitor(i, e.target.value)}
                placeholder={`Competitor domain ${i + 1}`}
                className={`${inputCls} pl-10`}
              />
            </div>
            {draft.competitors.length > 1 && (
              <button
                type="button"
                onClick={() => removeCompetitor(i)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle text-text-tertiary hover:border-border-default hover:text-text-secondary transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}

        {draft.competitors.length < 5 && (
          <button
            type="button"
            onClick={addCompetitor}
            className="flex items-center gap-1.5 text-[13px] text-brand-action hover:text-brand-action-hover transition-colors mt-1"
          >
            <Plus className="h-4 w-4" /> Add another competitor
          </button>
        )}
      </div>

      <StepNav onBack={onBack} onNext={onNext} nextLabel="Continue" skipLabel="Skip for now" onSkip={onNext} />
    </div>
  );
}

/* ──────────── Step 5: Brand voice (optional) + Create ──────────── */

function StepBrandVoice({
  draft, update, onBack, onCreate, creating, error, aiLoading, onAiFill,
}: StepProps & AiProps & { onCreate: () => void; creating: boolean; error: string }) {
  return (
    <div>
      <StepHeader
        num={5}
        title="Brand voice"
        sub="Optional — helps AI match your tone. Skip it and we'll use a professional default."
      />

      <div className="space-y-4">
        <FormField label="Brand voice / tone" hint="How should we write — formal, friendly, technical?">
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={draft.brand_voice}
              onChange={e => update("brand_voice", e.target.value)}
              placeholder="e.g. Friendly, expert, jargon-free"
              className={`${inputCls} flex-1`}
            />
            <AiButton
              busy={aiLoading === "brand_voice"}
              onClick={() => onAiFill("brand_voice")}
              disabled={!draft.company && !draft.domain}
            />
          </div>
        </FormField>

        <FormField label="Brand personality / bio" hint="One sentence about what makes you different">
          <div className="flex gap-2">
            <textarea
              value={draft.brand_description}
              onChange={e => update("brand_description", e.target.value)}
              placeholder="e.g. We make HR software that actually saves people time, not just promises it."
              rows={2}
              className={`${inputCls} flex-1 resize-none`}
            />
            <AiButton
              busy={aiLoading === "brand_description"}
              onClick={() => onAiFill("brand_description")}
              disabled={!draft.company && !draft.domain}
            />
          </div>
        </FormField>
      </div>

      {/* Project summary before create */}
      <div className="mt-6 rounded-xl border border-border-subtle bg-surface-elevated p-4 space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary mb-3">Ready to create</p>
        {[
          { label: "Project", value: draft.name || draft.company },
          { label: "Domain", value: draft.domain, mono: true },
          { label: "Industry", value: draft.niche || "—" },
          { label: "Competitors", value: draft.competitors.filter(c => c.trim()).length > 0 ? `${draft.competitors.filter(c => c.trim()).length} added` : "None" },
        ].map(row => (
          <div key={row.label} className="flex items-center justify-between gap-4">
            <span className="text-[12px] text-text-tertiary">{row.label}</span>
            <span className={`text-[13px] font-medium text-text-primary truncate max-w-[260px] ${row.mono ? "font-mono" : ""}`}>
              {row.value || "—"}
            </span>
          </div>
        ))}
      </div>

      {error && (
        <p className="mt-3 text-[13px] text-status-danger">{error}</p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-full border border-border-default bg-surface-elevated px-4 py-2.5 text-[13px] font-medium text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-text-primary px-6 py-2.5 text-[14px] font-semibold text-surface-primary shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
        >
          {creating ? (
            <>
              <Spinner size={14} className="text-surface-primary" />
              Creating project…
            </>
          ) : (
            <>
              Create project & discover keywords <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      <p className="mt-3 text-center text-[12px] text-text-tertiary">
        You can always change these settings later in the project
      </p>
    </div>
  );
}

/* ──────────── Shared helpers ──────────── */

interface StepProps {
  draft: ProjectDraft;
  update: <K extends keyof ProjectDraft>(field: K, value: ProjectDraft[K]) => void;
  onNext: () => void;
  onBack: () => void;
}

interface AiProps {
  aiLoading: string | null;
  onAiFill: (field: "niche" | "target_audience" | "brand_voice" | "brand_description") => void;
}

function StepHeader({ num, title, sub }: { num: number; title: string; sub: string }) {
  return (
    <div className="mb-7">
      <div className="inline-flex items-center gap-2 rounded-full border border-brand-violet/30 bg-brand-violet/8 px-2.5 py-0.5 text-[11px] font-semibold text-brand-violet mb-4">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-violet text-[10px] font-bold text-white">{num}</span>
        Step {num} of {TOTAL_STEPS}
      </div>
      <h2 className="text-[28px] font-semibold tracking-[-0.025em] text-text-primary leading-tight">{title}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">{sub}</p>
    </div>
  );
}

function FormField({
  label, required, hint, children,
}: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[13px] font-medium text-text-primary">
          {label}{required && <span className="text-status-danger ml-0.5">*</span>}
        </label>
        {hint && <span className="text-[11px] text-text-tertiary">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 rounded-xl border border-brand-violet/20 bg-brand-violet/6 px-4 py-3 text-[12.5px] leading-relaxed text-text-secondary">
      <Sparkles className="inline h-3.5 w-3.5 text-brand-violet mr-1.5 shrink-0" />
      {children}
    </div>
  );
}

function AiButton({
  busy, onClick, disabled,
}: { busy: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title="Fill with AI"
      className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-brand-action/40 bg-brand-action/10 px-2.5 py-2 text-[11.5px] font-semibold text-brand-action transition-all hover:border-brand-action/65 hover:bg-brand-action/18 disabled:opacity-40 disabled:cursor-not-allowed h-[42px]"
    >
      {busy ? <Spinner size={12} className="text-brand-action" /> : <Sparkles className="h-3.5 w-3.5" />}
      {!busy && <span>AI</span>}
    </button>
  );
}

function StepNav({
  onBack, onNext, disabled, nextLabel = "Continue", skipLabel, onSkip,
}: {
  onBack: () => void;
  onNext: () => void;
  disabled?: boolean;
  nextLabel?: string;
  skipLabel?: string;
  onSkip?: () => void;
}) {
  return (
    <div className="mt-8 flex items-center gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-full border border-border-default bg-surface-elevated px-4 py-2.5 text-[13px] font-medium text-text-secondary hover:border-border-strong hover:text-text-primary transition-colors shrink-0"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      {skipLabel && onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="text-[13px] text-text-tertiary hover:text-text-secondary transition-colors shrink-0"
        >
          {skipLabel}
        </button>
      )}

      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-text-primary px-5 py-2.5 text-[14px] font-semibold text-surface-primary shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0"
      >
        {nextLabel} <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border-default bg-surface-elevated px-4 py-2.5 text-[14px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-action focus:ring-1 focus:ring-brand-action/30 transition-colors";
