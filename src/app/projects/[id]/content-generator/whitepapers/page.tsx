"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import {
  Button,
  Card,
  Field,
  Input,
  PageTitle,
  Select,
  Spinner,
  Textarea,
} from "@/components/common";
import {
  ContentForm,
  ContentFormGrid,
  ContentFormSection,
  ChipChoice,
  GenerationProgress,
  KeywordChips,
  SectionHeading,
  StepRow,
  StudioBreadcrumb,
} from "@/components/content-generator/shared";
import { useProject, qk } from "@/lib/query";
import { contentGeneratorApi, type ContentStudioHistoryRow } from "@/frontend/api/content-generator";
import { TARGET_REGIONS } from "@/lib/types";
import {
  generateWhitepaperAction,
  suggestContentTopicAction,
} from "@/app/actions/content-actions";

const DEPTH_OPTIONS = [
  { id: "executive", label: "Executive", hint: "C-suite / VP — plain English" },
  { id: "analyst", label: "Analyst", hint: "Senior managers — methodology" },
  { id: "engineering", label: "Engineering", hint: "Practitioners — technical depth" },
] as const;

const LANG_OPTIONS = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
] as const;

type Phase = "form" | "review" | "generating";

export default function WhitepaperGeneratorPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const studioBase = `/projects/${projectId}/content-generator`;

  const { data: projectRes } = useProject(projectId);
  const project = projectRes?.success ? projectRes.data : undefined;

  const [phase, setPhase] = useState<Phase>("form");
  const [topic, setTopic] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [secondaryKeywords, setSecondaryKeywords] = useState<string[]>([]);
  const [audience, setAudience] = useState("");
  const [industry, setIndustry] = useState("");
  const [problem, setProblem] = useState("");
  const [angle, setAngle] = useState(
    "Synthesize industry data, regulator guidance, and primary-source reporting to surface a defensible point of view.",
  );
  const [objective, setObjective] = useState(
    "Position the brand as the authoritative reference and convert qualified buyers.",
  );
  const [depth, setDepth] = useState<(typeof DEPTH_OPTIONS)[number]["id"]>("analyst");
  const [region, setRegion] = useState("us");
  const [language, setLanguage] = useState("en");
  const [askLoading, setAskLoading] = useState(false);

  const { data: history } = useQuery({
    queryKey: qk.contentStudioHistory(projectId),
    queryFn: () => contentGeneratorApi.studioHistory(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
    refetchOnMount: false,
  });
  const recent = useMemo(() => {
    const rows: ContentStudioHistoryRow[] = history?.success ? history.data : [];
    return rows.filter(r => r.content_type === "whitepaper").slice(0, 4);
  }, [history]);

  useEffect(() => {
    if (project?.target_audience && !audience) setAudience(project.target_audience);
    if (project?.niche && !industry) setIndustry(project.niche);
    const tr = project?.target_region?.toLowerCase();
    if (tr && TARGET_REGIONS.some(r => r.code === tr)) setRegion(tr);
    const tl = project?.target_language?.toLowerCase();
    if (tl) setLanguage(tl);
  }, [project?.target_audience, project?.target_region, project?.target_language, project?.niche, audience, industry]);

  const askAi = async () => {
    setAskLoading(true);
    try {
      const res = await suggestContentTopicAction(projectId, {
        contentType: "whitepaper",
        avoidPhrases: secondaryKeywords,
      });
      if (res.success) {
        setTopic(res.topic);
        setPrimaryKeyword(res.primary_keyword);
        if (res.semantic_keywords.length) setSecondaryKeywords(res.semantic_keywords.slice(0, 8));
        toast.success("Topic + supporting cluster filled");
      } else {
        toast.error(res.error);
      }
    } finally {
      setAskLoading(false);
    }
  };

  const goReview = () => {
    if (!topic.trim()) return toast.error("Topic is required.");
    if (!primaryKeyword.trim()) return toast.error("Primary keyword is required.");
    if (!problem.trim()) return toast.error("Describe the problem this whitepaper solves.");
    setPhase("review");
  };

  const runGeneration = async () => {
    setPhase("generating");
    const res = await generateWhitepaperAction(projectId, {
      topic,
      primaryKeyword,
      secondaryKeywords,
      audience,
      industry,
      problemStatement: problem,
      technicalDepth: depth,
      researchAngle: angle,
      businessObjective: objective,
      region,
      language,
      semanticKeywords: secondaryKeywords,
    });
    if (res.trace?.length) {
      console.log("[whitepaper] trace:", res.trace);
    }
    if (res.success) {
      toast.success("Whitepaper ready — opening preview.");
      void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
      router.push(`${studioBase}/whitepapers/${res.data.id}`);
    } else {
      toast.error(res.error);
      setPhase("form");
    }
  };

  const heroTitle = phase === "generating" ? "Drafting your whitepaper" : phase === "review" ? "Review & generate" : "Whitepaper generator";
  const heroLead =
    phase === "generating"
      ? "Gemini 2.5 Pro is performing primary-source synthesis with Google Search grounding. This typically takes 4–8 minutes."
      : phase === "review"
        ? "Confirm the angle. We'll run live SERP research, methodology framing, and a Pro-tier draft pass."
        : "Configure the research angle, audience, and business objective. Whitepapers are EEAT-heavy by design.";

  return (
    <div className="relative space-y-10 pb-16 pl-4 pr-4">
      <div className="border-b border-border-subtle pb-8 pt-4">
        <StudioBreadcrumb parentHref={studioBase} parentLabel="Content generator" current="Whitepapers" />
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-3xl">
            <PageTitle>{heroTitle}</PageTitle>
            <p className="mt-3 text-[16px] leading-relaxed text-text-tertiary">{heroLead}</p>
          </div>
          {phase === "form" ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                shape="pill"
                size="lg"
                onClick={() => void askAi()}
                disabled={askLoading}
                iconLeft={askLoading ? <Spinner size={14} /> : null}
              >
                {askLoading ? "Thinking…" : "Ask AI for an angle"}
              </Button>
              <Button variant="primary" shape="pill" size="lg" onClick={goReview}>
                Review &amp; continue
              </Button>
            </div>
          ) : phase === "review" ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" shape="pill" size="lg" onClick={() => setPhase("form")}>
                Back to details
              </Button>
              <Button variant="primary" shape="pill" size="lg" onClick={() => void runGeneration()}>
                Generate whitepaper
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl">
        {phase !== "generating" ? (
          <StepRow
            steps={[
              { id: "details", label: "Brief & angle" },
              { id: "review", label: "Review & generate" },
            ]}
            activeIndex={phase === "review" ? 1 : 0}
          />
        ) : null}

        {phase === "generating" ? (
          <GenerationProgress
            badgeLabel="Whitepaper"
            title="Building your enterprise whitepaper"
            lead="Gemini 2.5 Pro is producing a fully-cited research document with executive summary, recommendations, and a roadmap."
            stages={[
              { id: "context", label: "Loading project brief", weight: 0.05 },
              { id: "research", label: "Live SERP + primary source discovery", weight: 0.22 },
              { id: "outline", label: "Structuring methodology + findings", weight: 0.13 },
              { id: "draft", label: "Drafting with Gemini 2.5 Pro", weight: 0.45 },
              { id: "polish", label: "Citation + SEO polish", weight: 0.15 },
            ]}
          />
        ) : phase === "review" ? (
          <ReviewView
            topic={topic}
            primaryKeyword={primaryKeyword}
            audience={audience}
            industry={industry}
            problem={problem}
            angle={angle}
            objective={objective}
            depthLabel={DEPTH_OPTIONS.find(d => d.id === depth)?.label ?? depth}
            secondaryKeywords={secondaryKeywords}
            regionLabel={TARGET_REGIONS.find(r => r.code === region)?.name ?? region}
            languageLabel={LANG_OPTIONS.find(l => l.code === language)?.label ?? language}
          />
        ) : (
          <ContentForm>
            <ContentFormSection>
              <SectionHeading
                index="01"
                label="Whitepaper brief"
                hint="The angle, the buyer, and the decision the reader is making."
              />
              <div className="space-y-5">
                <Field label="Whitepaper topic" required htmlFor="wp-topic">
                  <Input
                    id="wp-topic"
                    inputSize="lg"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="e.g. The Enterprise Buyer's Guide to AI Agent Procurement"
                  />
                </Field>
                <ContentFormGrid cols={2}>
                  <Field label="Primary SEO keyword" required htmlFor="wp-keyword">
                    <Input
                      id="wp-keyword"
                      inputSize="lg"
                      value={primaryKeyword}
                      onChange={e => setPrimaryKeyword(e.target.value)}
                      placeholder="enterprise ai agents"
                    />
                  </Field>
                  <Field label="Industry" required htmlFor="wp-industry">
                    <Input
                      id="wp-industry"
                      inputSize="lg"
                      value={industry}
                      onChange={e => setIndustry(e.target.value)}
                      placeholder="Enterprise SaaS"
                    />
                  </Field>
                </ContentFormGrid>
                <Field label="Audience" required htmlFor="wp-audience">
                  <Input
                    id="wp-audience"
                    inputSize="lg"
                    value={audience}
                    onChange={e => setAudience(e.target.value)}
                    placeholder="VP Engineering and Heads of AI at 1k+ person companies"
                  />
                </Field>
                <Field
                  label="Supporting / semantic keywords"
                  description="Optional. We weave these naturally across sections."
                  htmlFor="wp-secondary"
                >
                  <KeywordChips
                    id="wp-secondary"
                    value={secondaryKeywords}
                    onChange={setSecondaryKeywords}
                    placeholder="Type a phrase and press Enter…"
                  />
                </Field>
              </div>
            </ContentFormSection>

            <ContentFormSection>
              <SectionHeading index="02" label="Research framing" hint="What you want to prove and the evidence ceiling." />
              <div className="space-y-5">
                <Field label="Problem statement" required htmlFor="wp-problem">
                  <Textarea
                    id="wp-problem"
                    rows={3}
                    value={problem}
                    onChange={e => setProblem(e.target.value)}
                    placeholder="What painful, current decision is the reader trying to make?"
                  />
                </Field>
                <Field label="Research angle" htmlFor="wp-angle">
                  <Textarea
                    id="wp-angle"
                    rows={3}
                    value={angle}
                    onChange={e => setAngle(e.target.value)}
                    placeholder="What's the thesis or methodology that makes this whitepaper credible?"
                  />
                </Field>
                <Field label="Business objective" htmlFor="wp-objective">
                  <Textarea
                    id="wp-objective"
                    rows={2}
                    value={objective}
                    onChange={e => setObjective(e.target.value)}
                    placeholder="What's the strategic outcome for your company?"
                  />
                </Field>
                <Field label="Technical depth">
                  <ChipChoice
                    options={DEPTH_OPTIONS.map(o => ({ id: o.id, label: o.label, hint: o.hint }))}
                    value={depth}
                    onChange={setDepth}
                    ariaLabel="Technical depth"
                  />
                </Field>
                <ContentFormGrid cols={2}>
                  <Field label="Region" htmlFor="wp-region">
                    <Select id="wp-region" inputSize="lg" value={region} onChange={e => setRegion(e.target.value)}>
                      {TARGET_REGIONS.map(r => (
                        <option key={r.code} value={r.code}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Language" htmlFor="wp-language">
                    <Select id="wp-language" inputSize="lg" value={language} onChange={e => setLanguage(e.target.value)}>
                      {LANG_OPTIONS.map(l => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </ContentFormGrid>
              </div>
            </ContentFormSection>

            {recent.length > 0 ? (
              <ContentFormSection>
                <SectionHeading index="03" label="Recent whitepapers" hint="Open the previewer to copy or export." />
                <div className="grid gap-3 sm:grid-cols-2">
                  {recent.map(r => (
                    <ProjectNavLink
                      key={r.id}
                      href={`${studioBase}/whitepapers/${r.id}`}
                      className="group flex flex-col gap-1 rounded-card border border-border-subtle bg-surface-elevated p-4 transition-colors hover:border-border-strong"
                    >
                      <span className="text-[11px] font-mono uppercase tracking-widest text-text-tertiary">
                        {new Date(r.updated_at).toLocaleDateString()}
                      </span>
                      <span className="text-[14px] font-semibold text-text-primary line-clamp-2">{r.title}</span>
                      <span className="mt-1 text-[11px] text-text-tertiary">
                        {r.word_count.toLocaleString()} words · {r.target_keyword || "no primary keyword"}
                      </span>
                    </ProjectNavLink>
                  ))}
                </div>
              </ContentFormSection>
            ) : null}
          </ContentForm>
        )}
      </div>
    </div>
  );
}

function ReviewView(props: {
  topic: string;
  primaryKeyword: string;
  audience: string;
  industry: string;
  problem: string;
  angle: string;
  objective: string;
  depthLabel: string;
  secondaryKeywords: string[];
  regionLabel: string;
  languageLabel: string;
}) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Topic", value: props.topic },
    { label: "Primary keyword", value: props.primaryKeyword },
    { label: "Industry", value: props.industry },
    { label: "Audience", value: props.audience },
    { label: "Technical depth", value: props.depthLabel },
    { label: "Region", value: props.regionLabel },
    { label: "Language", value: props.languageLabel },
  ];
  if (props.secondaryKeywords.length) {
    rows.push({
      label: "Supporting keywords",
      value: (
        <span className="flex flex-wrap gap-1.5">
          {props.secondaryKeywords.map(k => (
            <span
              key={k}
              className="rounded-full border border-border-subtle bg-surface-secondary px-2 py-0.5 text-[11px] text-text-secondary"
            >
              {k}
            </span>
          ))}
        </span>
      ),
    });
  }

  return (
    <div className="space-y-8">
      <Card padding="lg" elevation="raised">
        <SectionHeading index="01" label="Whitepaper brief summary" />
        <dl className="grid gap-5 sm:grid-cols-2">
          {rows.map(r => (
            <div key={r.label}>
              <dt className="font-mono text-[10px] font-medium uppercase tracking-widest text-text-tertiary">
                {r.label}
              </dt>
              <dd className="mt-1 wrap-break-word text-[14px] font-medium text-text-primary">{r.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card padding="md" elevation="flat">
        <SectionHeading index="02" label="Research framing" />
        <p className="text-[14px] leading-relaxed text-text-secondary">
          <strong className="text-text-primary">Problem:</strong> {props.problem}
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
          <strong className="text-text-primary">Angle:</strong> {props.angle}
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
          <strong className="text-text-primary">Objective:</strong> {props.objective}
        </p>
      </Card>
    </div>
  );
}
