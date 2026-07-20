"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { projectsApi } from "@/frontend/api/projects";
import { suggestProjectTargetingField } from "@/app/actions/project-actions";
import { TARGET_REGIONS } from "@/lib/types";
import { ArrowRight, ArrowLeft, Plus, X, Sparkles, Globe2 } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { AuthUserButton as UserButton } from "@/components/auth-wrapper";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, Field, Label, Input, Textarea, Select, IconButton, AiFillLabelButton } from "@/components/common";
import { useUserQuota } from "@/hooks/useUserQuota";

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
  brand_values: string;
  brand_description: string;
}

const TOTAL_STEPS = 5;

export function OnboardingFlow({ userName }: { userName: string }) {
  const router = useRouter();
  const { hasAiCredits } = useUserQuota();
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
    brand_values: "",
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

  async function fillWithAi(field: "niche" | "target_audience" | "brand_voice" | "brand_values" | "brand_description") {
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
        brand_values: draft.brand_values,
        brand_description: draft.brand_description,
      });
      if (res.success && res.data) {
        router.push(`/projects/${res.data.id}`);
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
  const aiProps = { aiLoading, onAiFill: fillWithAi, hasAiCredits };

  return (
    <div className="relative min-h-screen bg-surface-primary flex flex-col">
      {/* Background glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[600px] w-[1000px] rounded-full bg-brand-violet/10 blur-[140px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[500px] rounded-full bg-brand-aqua/6 blur-[120px]" />
      </div>

      {/* Top bar — same nav chrome as the projects page (logo, step progress, theme, profile/logout) */}
      <header className="sticky top-0 z-40 flex justify-center px-4 pt-4 pb-1">
        <div className="flex w-full max-w-[900px] items-center justify-between rounded-card border border-border-subtle bg-glass px-5 py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.08)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.32)] backdrop-blur-md">
          <Logo size="sm" />
          <div className="flex items-center gap-4">
            {step > 0 && (
              <div className="hidden items-center gap-3 sm:flex">
                <span className="text-[12px] text-text-tertiary">
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
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <UserButton />
            </div>
          </div>
        </div>
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
          {step === 3 && <StepNicheAudience {...sharedProps} {...aiProps} />}
          {step === 4 && <StepCompetitors {...sharedProps} />}
          {step === 5 && (
            <StepBrandVoice
              {...sharedProps}
              {...aiProps}
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
      <div className="inline-flex items-center gap-2 rounded-md border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary mb-8">
        <span className="ai-orb" /> Your AI SEO workspace
      </div>

      <h1 className="text-[40px] font-semibold tracking-[-0.03em] leading-[1.05] text-text-primary">
        {firstName ? `Hey ${firstName} 👋` : "Welcome 👋"}
      </h1>
      <p className="mt-4 text-[16px] leading-relaxed text-text-secondary max-w-[380px] mx-auto">
        Let&rsquo;s set up your first project. In about 2 minutes you&rsquo;ll have
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
            className="rounded-card border border-border-subtle bg-surface-elevated p-3.5"
          >
            <div className="text-[20px] mb-2">{item.emoji}</div>
            <div className="text-[13px] font-semibold text-text-primary">{item.title}</div>
            <div className="mt-0.5 text-[11.5px] text-text-tertiary leading-snug">{item.desc}</div>
          </div>
        ))}
      </div>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={onStart}
        className="mt-8"
        iconRight={<ArrowRight />}
      >
        Let&rsquo;s get started
      </Button>

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
        <Field label="Project name" required htmlFor="ob-name">
          <Input
            id="ob-name"
            autoFocus
            value={draft.name}
            onChange={e => update("name", e.target.value)}
            onKeyDown={e => e.key === "Enter" && canContinue && onNext()}
            placeholder="e.g. Main SEO Campaign"
          />
        </Field>
        <Field label="Company name" required htmlFor="ob-company">
          <Input
            id="ob-company"
            value={draft.company}
            onChange={e => update("company", e.target.value)}
            onKeyDown={e => e.key === "Enter" && canContinue && onNext()}
            placeholder="e.g. Acme Corp"
          />
        </Field>
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
        <Field label="Website domain" required htmlFor="ob-domain" description="Just the domain — no https:// needed">
          <div className="relative">
            <Globe2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
            <Input
              id="ob-domain"
              autoFocus
              value={draft.domain}
              onChange={e => update("domain", e.target.value)}
              onKeyDown={e => e.key === "Enter" && canContinue && onNext()}
              placeholder="yourwebsite.com"
              className="pl-10"
            />
          </div>
        </Field>

        <Field label="Target region" required htmlFor="ob-region" description="Primary market you're writing content for">
          <Select id="ob-region" value={draft.target_region} onChange={e => update("target_region", e.target.value)}>
            {TARGET_REGIONS.map(r => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </Select>
        </Field>

        <Field label="Short description" htmlFor="ob-description" description="Optional — helps AI generate better keyword suggestions">
          <Textarea
            id="ob-description"
            value={draft.description}
            onChange={e => update("description", e.target.value)}
            placeholder="What does your company do? Who are your customers? (2–3 sentences)"
            rows={3}
            className="resize-none"
          />
        </Field>
      </div>
      <StepNav onBack={onBack} onNext={onNext} disabled={!canContinue} />
    </div>
  );
}

/* ──────────── Step 3: Niche & audience ──────────── */

function StepNicheAudience({
  draft, update, onNext, onBack, aiLoading, onAiFill, hasAiCredits,
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
        <strong>Tip:</strong> Use 1–3 word descriptions for niche (e.g. &ldquo;SaaS HR software&rdquo;) and audience (e.g. &ldquo;HR managers at SMBs&rdquo;) — this dramatically improves keyword relevance.
      </InfoTip>

      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
            <Label htmlFor="ob-niche" required className="min-w-0 flex-1">
              Niche / Industry
            </Label>
            <AiFillLabelButton
              busy={aiLoading === "niche"}
              disabled={!draft.company && !draft.domain}
              onClick={() => onAiFill("niche")}
              hasAiCredits={hasAiCredits}
            />
          </div>
          <Input
            id="ob-niche"
            autoFocus
            value={draft.niche}
            onChange={e => update("niche", e.target.value)}
            onKeyDown={e => e.key === "Enter" && canContinue && onNext()}
            placeholder="e.g. SaaS HR software"
          />
        </div>

        <div>
          <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
            <Label htmlFor="ob-audience" className="min-w-0 flex-1">
              Target audience
            </Label>
            <AiFillLabelButton
              busy={aiLoading === "target_audience"}
              disabled={!draft.niche}
              onClick={() => onAiFill("target_audience")}
              hasAiCredits={hasAiCredits}
            />
          </div>
          <Input
            id="ob-audience"
            value={draft.target_audience}
            onChange={e => update("target_audience", e.target.value)}
            placeholder="e.g. HR managers at mid-size companies"
          />
        </div>
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
        sub="Optional but powerful — we&rsquo;ll find keywords they rank for that you can steal."
      />

      <InfoTip>
        <strong>How we use this:</strong> We analyze competitor rankings to surface keyword gaps — pages they rank for that you don&rsquo;t. You can skip this and add competitors later.
      </InfoTip>

      <div className="space-y-2.5">
        {draft.competitors.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Globe2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
              <Input
                value={c}
                onChange={e => updateCompetitor(i, e.target.value)}
                placeholder={`Competitor domain ${i + 1}`}
                className="pl-10"
              />
            </div>
            {draft.competitors.length > 1 && (
              <IconButton
                aria-label="Remove competitor"
                onClick={() => removeCompetitor(i)}
                variant="ghost"
                className="hover:bg-status-danger/10 hover:text-status-danger"
              >
                <X className="h-4 w-4" />
              </IconButton>
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

/* ──────────── Step 5: Brand persona (optional) + Create ──────────── */

function StepBrandVoice({
  draft, update, onBack, onCreate, creating, error, aiLoading, onAiFill, hasAiCredits,
}: StepProps & AiProps & { onCreate: () => void; creating: boolean; error: string }) {
  return (
    <div>
      <StepHeader
        num={5}
        title="Brand persona"
        sub="Optional — helps AI match your tone. Skip it and we'll use a professional default."
      />

      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
            <Label htmlFor="ob-brand-voice" className="min-w-0 flex-1">
              Brand Voice / Tone
            </Label>
            <AiFillLabelButton
              busy={aiLoading === "brand_voice"}
              disabled={!draft.company && !draft.domain}
              onClick={() => onAiFill("brand_voice")}
              hasAiCredits={hasAiCredits}
            />
          </div>
          <Input
            id="ob-brand-voice"
            autoFocus
            value={draft.brand_voice}
            onChange={e => update("brand_voice", e.target.value)}
            placeholder="e.g. professional, authoritative, warm, witty"
          />
          <p className="mt-1 text-[11px] text-text-tertiary">
            Adjectives describing how your brand sounds to others.
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
            <Label htmlFor="ob-brand-values" className="min-w-0 flex-1">
              Core Values / Messaging
            </Label>
            <AiFillLabelButton
              busy={aiLoading === "brand_values"}
              disabled={!draft.company && !draft.domain}
              onClick={() => onAiFill("brand_values")}
              hasAiCredits={hasAiCredits}
            />
          </div>
          <Input
            id="ob-brand-values"
            value={draft.brand_values}
            onChange={e => update("brand_values", e.target.value)}
            placeholder="e.g. customer-first, sustainability, transparency"
          />
          <p className="mt-1 text-[11px] text-text-tertiary">
            Key principles or messaging themes driving your brand.
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2">
            <Label htmlFor="ob-brand-desc" className="min-w-0 flex-1">
              Brand Personality / Description
            </Label>
            <AiFillLabelButton
              busy={aiLoading === "brand_description"}
              disabled={!draft.company && !draft.domain}
              onClick={() => onAiFill("brand_description")}
              hasAiCredits={hasAiCredits}
            />
          </div>
          <Textarea
            id="ob-brand-desc"
            rows={2}
            value={draft.brand_description}
            onChange={e => update("brand_description", e.target.value)}
            placeholder="e.g. An expert advisor explaining complex concepts simply without jargon."
            className="resize-none"
          />
          <p className="mt-1 text-[11px] text-text-tertiary">
            Brief description of your brand&rsquo;s character or persona.
          </p>
        </div>
      </div>

      {/* Project summary before create */}
      <div className="mt-6 rounded-card border border-border-subtle bg-surface-elevated p-4 space-y-2">
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
        <Button variant="secondary" onClick={onBack} iconLeft={<ArrowLeft />}>
          Back
        </Button>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          onClick={onCreate}
          loading={creating}
          iconRight={!creating ? <ArrowRight /> : undefined}
        >
          {creating ? "Creating project…" : "Create project & discover keywords"}
        </Button>
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
  onAiFill: (field: "niche" | "target_audience" | "brand_voice" | "brand_values" | "brand_description") => void;
  hasAiCredits: boolean;
}

function StepHeader({ num, title, sub }: { num: number; title: string; sub: string }) {
  return (
    <div className="mb-7">
      <div className="inline-flex items-center gap-2 rounded-md border border-brand-violet/30 bg-brand-violet/8 px-2.5 py-0.5 text-[11px] font-semibold text-brand-violet mb-4">
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-violet text-[10px] font-bold text-white">{num}</span>
        Step {num} of {TOTAL_STEPS}
      </div>
      <h2 className="text-[28px] font-semibold tracking-[-0.025em] text-text-primary leading-tight">{title}</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-text-secondary">{sub}</p>
    </div>
  );
}

function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 rounded-card border border-brand-violet/20 bg-brand-violet/6 px-4 py-3 text-[12.5px] leading-relaxed text-text-secondary">
      <Sparkles className="inline h-3.5 w-3.5 text-brand-violet mr-1.5 shrink-0" />
      {children}
    </div>
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
      <Button variant="secondary" onClick={onBack} iconLeft={<ArrowLeft />}>
        Back
      </Button>

      {skipLabel && onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="text-[13px] text-text-tertiary hover:text-text-secondary transition-colors shrink-0"
        >
          {skipLabel}
        </button>
      )}

      <Button variant="primary" fullWidth onClick={onNext} disabled={disabled} iconRight={<ArrowRight />}>
        {nextLabel}
      </Button>
    </div>
  );
}
