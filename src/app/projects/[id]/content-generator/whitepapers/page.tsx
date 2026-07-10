"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useKeywordParam } from "@/hooks/useKeywordParam";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
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
  RecentHistorySkeleton,
  AskAiButton,
  TopicSuggestionChips,
  useAiFillTracker,
} from "@/components/content-generator/shared";
import { useProject, qk, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import { calendarApi } from "@/frontend/api/calendar";
import { contentGeneratorApi, type ContentStudioHistoryRow } from "@/frontend/api/content-generator";
import { TARGET_REGIONS } from "@/lib/types";
import {
  generateWhitepaperAction,
  suggestContentTopicAction,
} from "@/app/actions/content-actions";
import { useUserQuota } from "@/hooks/useUserQuota";
import { useAppDispatch } from "@/lib/redux/hooks";
import { calendarRefreshBump } from "@/lib/redux/keyword-workspace-slice";
import {
  WP_DEPTH_OPTIONS,
  WP_LANG_OPTIONS,
} from "@/constants";

type Phase = "form" | "review" | "generating";

export default function WhitepaperGeneratorPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const { canGenerateWhitepaper, quota, hasAiCredits } = useUserQuota();
  const studioBase = `/projects/${projectId}/content-generator`;

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const entryId = searchParams?.get("entryId");

  const { data: entriesData } = useQuery({
    queryKey: qk.calendarWithBlogs(projectId),
    queryFn: () => calendarApi.withBlogs(projectId),
    enabled: !!projectId && !!entryId,
    ...DEFAULT_QUERY_OPTIONS,
  });

  const scheduledEntry = useMemo(() => {
    if (!entriesData?.success) return null;
    return entriesData.data.find((e) => e.id === entryId) || null;
  }, [entriesData, entryId]);

  const { data: projectRes } = useProject(projectId);
  const project = projectRes?.success ? projectRes.data : undefined;

  const keywordParam = searchParams?.get("keyword") || "";
  const { value: primaryKeyword, setValue: setPrimaryKeyword, isTyping: isKeywordTyping } = useKeywordParam(keywordParam);

  const [phase, setPhase] = useState<Phase>("form");
  const [topic, setTopic] = useState("");
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
  const [depth, setDepth] = useState<(typeof WP_DEPTH_OPTIONS)[number]["id"]>("analyst");
  const [customWordCount, setCustomWordCount] = useState<string>("");
  const [region, setRegion] = useState("us");
  const [language, setLanguage] = useState("en");
  const [askLoading, setAskLoading] = useState(false);
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([]);
  const { isAiOwned, markUserOwned, canAutoFill, markAiFilled, fillFlashClass } = useAiFillTracker();

  useEffect(() => {
    if (project?.target_audience && !audience) setAudience(project.target_audience);
    if (project?.niche && !industry) setIndustry(project.niche);
    const tr = project?.target_region?.toLowerCase();
    if (tr && TARGET_REGIONS.some(r => r.code === tr)) setRegion(tr);
    const tl = project?.target_language?.toLowerCase();
    if (tl) setLanguage(tl);
  }, [project?.target_audience, project?.target_region, project?.target_language, project?.niche, audience, industry]);

  useEffect(() => {
    if (scheduledEntry) {
      if (scheduledEntry.focus_keyword && !keywordParam) setPrimaryKeyword(scheduledEntry.focus_keyword);
      const realTitle = scheduledEntry.blog_title?.trim();
      if (realTitle) {
        setTopic(realTitle.replace(/^\[Draft\]\s*/, ""));
      }
      if (scheduledEntry.secondary_keywords?.length) {
        setSecondaryKeywords(scheduledEntry.secondary_keywords);
      }
    }
  }, [scheduledEntry]);

  // Compute which required fields are empty — drives CTA disabled state
  const emptyRequiredFields = useMemo(() => {
    const missing: string[] = [];
    if (!topic.trim()) missing.push("Whitepaper topic");
    if (!primaryKeyword.trim()) missing.push("Primary SEO keyword");
    if (!problem.trim()) missing.push("Problem statement");
    return missing;
  }, [topic, primaryKeyword, problem]);

  const isFormValid = emptyRequiredFields.length === 0;

  // Auto-fill: completes only fields the user left empty — user-typed values
  // are passed as seeds and never replaced.
  const askAi = async (opts?: { reload?: boolean }) => {
    setAskLoading(true);
    try {
      const res = await suggestContentTopicAction(projectId, {
        contentType: "whitepaper",
        avoidPhrases: secondaryKeywords,
        seedKeyword: primaryKeyword.trim() && !isAiOwned("keyword") ? primaryKeyword.trim() : undefined,
        seedTopic: topic.trim() && !isAiOwned("topic") ? topic.trim() : undefined,
        avoidTopics: opts?.reload ? topicSuggestions : undefined,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      const filled: string[] = [];
      if (res.topic && canAutoFill("topic", topic)) { setTopic(res.topic); filled.push("topic"); }
      if (res.primary_keyword && canAutoFill("keyword", primaryKeyword)) { setPrimaryKeyword(res.primary_keyword); filled.push("keyword"); }
      if (res.semantic_keywords.length && canAutoFill("secondaryKeywords", secondaryKeywords)) {
        setSecondaryKeywords(res.semantic_keywords.slice(0, 8));
        filled.push("secondaryKeywords");
      }
      if (res.goal && canAutoFill("problem", problem)) { setProblem(res.goal); filled.push("problem"); }
      markAiFilled(filled);
      setTopicSuggestions(Array.from(new Set([res.topic, ...(res.alternate_topics ?? [])].filter(Boolean))));
      toast.success(
        filled.length
          ? `AI filled ${filled.length} field${filled.length === 1 ? "" : "s"} — your entries were kept`
          : "Topic ideas ready — pick one below the topic field"
      );
    } finally {
      setAskLoading(false);
    }
  };

  const goReview = () => {
    if (!isFormValid) {
      toast.error(`Please fill in: ${emptyRequiredFields.join(", ")}`);
      return;
    }
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
      customWordCount: customWordCount ? parseInt(customWordCount, 10) : undefined,
      researchAngle: angle,
      businessObjective: objective,
      region,
      language,
      semanticKeywords: secondaryKeywords,
      entryId: entryId || null,
    });
    if (res.trace?.length) {
      console.log("[whitepaper] trace:", res.trace);
    }
    if (res.success) {
      toast.success("Whitepaper ready — opening preview.");
      void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
      if (entryId) {
        void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
        dispatch(calendarRefreshBump({ projectId }));
      }
      router.push(`${studioBase}/whitepapers/${res.data.id}`);
    } else {
      toast.error(res.error);
      setPhase("form");
    }
  };

  const heroTitle = phase === "generating" ? "Drafting your whitepaper" : phase === "review" ? "Review & generate" : "Whitepaper generator";
  const heroLead =
    phase === "generating"
      ? "Performing primary-source synthesis with Google Search grounding. This typically takes 4–8 minutes."
      : phase === "review"
        ? "Confirm the angle. We'll run live SERP research, methodology framing, and a premium draft pass."
        : "Configure the research angle, audience, and business objective. Whitepapers are EEAT-heavy by design.";

  return (
    <div className={`relative space-y-10 pb-16 pl-4 pr-4 ${mounted ? "animate-slide-in-right" : ""}`}>
      {!canGenerateWhitepaper && quota && (
        <div className="text-[14px] text-status-danger font-medium">
          Whitepaper limit reached ({quota.whitepapers.used}/{quota.whitepapers.effectiveLimit}). Upgrade your plan to generate more whitepapers.
        </div>
      )}
      <PageHeader
        title={heroTitle}
        description={heroLead}
        actions={
          phase === "form" ? (
            <div className="flex flex-wrap items-center gap-3">
              <AskAiButton
                onClick={() => void askAi()}
                loading={askLoading}
                disabled={!hasAiCredits}
                disabledReason="You've exhausted your AI credits. Upgrade to get more."
              />
              <button
                onClick={goReview}
                disabled={!isFormValid || !canGenerateWhitepaper}
                title={
                  !canGenerateWhitepaper
                    ? `Whitepaper limit reached (${quota?.whitepapers.used}/${quota?.whitepapers.effectiveLimit}). Upgrade your plan to generate more.`
                    : !isFormValid
                    ? `Required: ${emptyRequiredFields.join(", ")}`
                    : undefined
                }
                className={
                  "inline-flex h-10 items-center justify-center rounded-full px-5 text-[14px] font-semibold transition-all " +
                  (isFormValid && canGenerateWhitepaper
                    ? "bg-brand-action text-white hover:opacity-90 cursor-pointer"
                    : "bg-text-primary/15 text-text-tertiary cursor-not-allowed opacity-60")
                }
              >
                Review &amp; continue
              </button>
            </div>
          ) : phase === "review" ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" shape="pill" size="lg" onClick={() => setPhase("form")}>
                Back to details
              </Button>
              <Button
                variant="primary"
                shape="pill"
                size="lg"
                onClick={() => void runGeneration()}
                disabled={!canGenerateWhitepaper}
                title={
                  !canGenerateWhitepaper
                    ? `Whitepaper limit reached (${quota?.whitepapers.used}/${quota?.whitepapers.effectiveLimit}). Upgrade your plan to generate more.`
                    : undefined
                }
              >
                Generate whitepaper
              </Button>
            </div>
          ) : null
        }
      />

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
            lead="Producing a fully-cited research document with executive summary, recommendations, and a roadmap."
            stages={[
              { id: "context", label: "Loading project brief", weight: 0.05 },
              { id: "research", label: "Live SERP + primary source discovery", weight: 0.22 },
              { id: "outline", label: "Structuring methodology + findings", weight: 0.13 },
              { id: "draft", label: "Drafting content", weight: 0.45 },
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
            depthLabel={WP_DEPTH_OPTIONS.find(d => d.id === depth)?.label ?? depth}
            secondaryKeywords={secondaryKeywords}
            regionLabel={TARGET_REGIONS.find(r => r.code === region)?.name ?? region}
            languageLabel={WP_LANG_OPTIONS.find(l => l.code === language)?.label ?? language}
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
                    onChange={e => { setTopic(e.target.value); markUserOwned("topic"); }}
                    placeholder="e.g. The Enterprise Buyer's Guide to AI Agent Procurement"
                    className={fillFlashClass("topic")}
                  />
                  <TopicSuggestionChips
                    suggestions={topicSuggestions}
                    activeTopic={topic}
                    onPick={t => setTopic(t)}
                    onReload={() => void askAi({ reload: true })}
                    loading={askLoading}
                  />
                </Field>
                <ContentFormGrid cols={2}>
                  <Field label="Primary SEO keyword" required htmlFor="wp-keyword">
                    <Input
                      id="wp-keyword"
                      inputSize="lg"
                      value={primaryKeyword}
                      onChange={e => { setPrimaryKeyword(e.target.value); markUserOwned("keyword"); }}
                      placeholder="enterprise ai agents"
                      className={`${isKeywordTyping ? "ring-2 ring-brand-action/40 border-brand-action/50" : ""} ${fillFlashClass("keyword")}`}
                    />
                    {/* {keywordParam && (
                      <p className={`mt-1.5 flex items-center gap-1.5 text-[11px] transition-colors duration-300 ${isKeywordTyping ? "text-brand-action" : "text-emerald-400"}`}>
                        {isKeywordTyping ? (
                          <><span className="h-1.5 w-1.5 rounded-full bg-brand-action animate-pulse shrink-0" />Filling from keyword discovery…</>
                        ) : (
                          <><svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>Auto-filled from keyword discovery</>
                        )}
                      </p>
                    )} */}
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
                  <div className={`rounded-lg ${fillFlashClass("secondaryKeywords")}`}>
                    <KeywordChips
                      id="wp-secondary"
                      value={secondaryKeywords}
                      onChange={v => { setSecondaryKeywords(v); markUserOwned("secondaryKeywords"); }}
                      placeholder="Type a phrase and press Enter…"
                    />
                  </div>
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
                    onChange={e => { setProblem(e.target.value); markUserOwned("problem"); }}
                    placeholder="What painful, current decision is the reader trying to make?"
                    className={fillFlashClass("problem")}
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
                    options={WP_DEPTH_OPTIONS.map(o => ({ id: o.id, label: o.label, hint: o.hint }))}
                    value={depth}
                    onChange={setDepth}
                    ariaLabel="Technical depth"
                  />
                </Field>
                <Field
                  label="Custom word count (optional)"
                  description="Override the depth preset with an exact word count. Leave blank to use the depth preset above."
                  htmlFor="wp-word-count"
                >
                  <Input
                    id="wp-word-count"
                    type="number"
                    inputSize="lg"
                    min={2500}
                    max={12000}
                    step={500}
                    placeholder={`e.g. 5000 — or leave blank to use ${WP_DEPTH_OPTIONS.find(d => d.id === depth)?.label ?? depth} preset`}
                    value={customWordCount}
                    onChange={e => setCustomWordCount(e.target.value)}
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
                      {WP_LANG_OPTIONS.map(l => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </ContentFormGrid>
              </div>
            </ContentFormSection>

            <Suspense fallback={<RecentHistorySkeleton />}>
              <RecentWhitepapersList projectId={projectId} studioBase={studioBase} />
            </Suspense>
          </ContentForm>
        )}
      </div>
    </div>
  );
}

function RecentWhitepapersList({ projectId, studioBase }: { projectId: string; studioBase: string }) {
  const { data: history } = useSuspenseQuery({
    queryKey: qk.contentStudioHistory(projectId),
    queryFn: () => contentGeneratorApi.studioHistory(projectId),
    ...DEFAULT_QUERY_OPTIONS,
  });

  const recent = useMemo(() => {
    const rows: ContentStudioHistoryRow[] = history?.success ? history.data : [];
    return rows.filter(r => r.content_type === "whitepaper").slice(0, 4);
  }, [history]);

  if (recent.length === 0) return null;

  return (
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
