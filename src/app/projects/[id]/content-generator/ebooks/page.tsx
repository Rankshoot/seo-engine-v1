"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
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
  RecentHistorySkeleton,
  validateEbookForm,
} from "@/components/content-generator/shared";
import { useProject, qk, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import { calendarApi } from "@/frontend/api/calendar";
import { contentGeneratorApi, type ContentStudioHistoryRow } from "@/frontend/api/content-generator";
import { TARGET_REGIONS } from "@/lib/types";
import {
  generateEbookAction,
  suggestContentTopicAction,
} from "@/app/actions/content-actions";
import {
  EBOOK_TONES,
  EBOOK_DEPTH_OPTIONS,
  EBOOK_LANG_OPTIONS,
} from "@/constants";

type Phase = "form" | "review" | "generating";

export default function EbookGeneratorPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const base = `/projects/${projectId}`;
  const studioBase = `${base}/content-generator`;

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

  const [phase, setPhase] = useState<Phase>("form");
  const [topic, setTopic] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState(searchParams?.get("keyword") || "");
  const [secondaryKeywords, setSecondaryKeywords] = useState<string[]>([]);
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState<(typeof EBOOK_TONES)[number]["id"]>("premium-educational");
  const [goal, setGoal] = useState("Educate the reader and capture qualified leads.");
  const [ctaObjective, setCtaObjective] = useState(
    "Book a demo or download a deeper resource on our site.",
  );
  const [chapterDepth, setChapterDepth] = useState<(typeof EBOOK_DEPTH_OPTIONS)[number]["id"]>("standard");
  const [region, setRegion] = useState("us");
  const [language, setLanguage] = useState("en");
  const [askLoading, setAskLoading] = useState(false);

  useEffect(() => {
    if (project?.target_audience && !audience) {
      setAudience(project.target_audience);
    }
    const tr = project?.target_region?.toLowerCase();
    if (tr && TARGET_REGIONS.some(r => r.code === tr)) setRegion(tr);
    const tl = project?.target_language?.toLowerCase();
    if (tl) setLanguage(tl);
    // Stable to project signal — only fires once per project change.
  }, [project?.target_audience, project?.target_region, project?.target_language, audience]);

  useEffect(() => {
    if (scheduledEntry) {
      if (scheduledEntry.focus_keyword) {
        setPrimaryKeyword(scheduledEntry.focus_keyword);
      }
      if (scheduledEntry.title || scheduledEntry.blog_title) {
        const t = scheduledEntry.title || scheduledEntry.blog_title;
        setTopic(t ? t.replace(/^\[Draft\]\s*/, "") : "");
      }
      if (scheduledEntry.secondary_keywords?.length) {
        setSecondaryKeywords(scheduledEntry.secondary_keywords);
      }
    }
  }, [scheduledEntry]);

  const askAi = async () => {
    setAskLoading(true);
    try {
      const res = await suggestContentTopicAction(projectId, {
        contentType: "ebook",
        avoidPhrases: secondaryKeywords,
        seedKeyword: primaryKeyword.trim() || undefined,
      });
      if (res.success) {
        setTopic(res.topic);
        setPrimaryKeyword(res.primary_keyword);
        if (res.semantic_keywords.length) setSecondaryKeywords(res.semantic_keywords.slice(0, 8));
        toast.success("Filled topic, keyword, and supporting cluster");
      } else {
        toast.error(res.error);
      }
    } finally {
      setAskLoading(false);
    }
  };

  const goReview = () => {
    const val = validateEbookForm(topic, primaryKeyword, audience);
    if (!val.isValid) {
      return toast.error(val.error || "Validation failed");
    }
    setPhase("review");
  };

  const runGeneration = async () => {
    setPhase("generating");
    const res = await generateEbookAction(projectId, {
      topic,
      primaryKeyword,
      secondaryKeywords,
      audience,
      tone: EBOOK_TONES.find(t => t.id === tone)?.label ?? tone,
      goal,
      ctaObjective,
      chapterDepth,
      region,
      language,
      semanticKeywords: secondaryKeywords,
      entryId: entryId || null,
    });
    if (res.trace?.length) {
      console.log("[ebook] trace:", res.trace);
    }
    if (res.success) {
      toast.success("Ebook ready — opening preview.");
      void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
      router.push(`${studioBase}/ebooks/${res.data.id}`);
    } else {
      toast.error(res.error);
      setPhase("form");
    }
  };

  const heroTitle = useMemo(() => {
    if (phase === "generating") return "Drafting your ebook";
    if (phase === "review") return "Review & generate";
    return "Ebook generator";
  }, [phase]);

  const heroLead = useMemo(() => {
    if (phase === "generating")
      return "Gemini 2.5 Pro is synthesising live research, your brief, and approved keywords into a publication-ready ebook. Keep this tab open.";
    if (phase === "review")
      return "Confirm the angle. We'll run live SERP research, internal-link discovery, and a Pro-tier draft pass before saving.";
    return "Configure the ebook angle, audience, and CTA. Ask AI to seed it from your project domain when you're not sure where to start.";
  }, [phase]);

  return (
    <div className="relative space-y-10 pb-16 pl-4 pr-4">
      <div className="border-b border-border-subtle pb-8 pt-4">
        <StudioBreadcrumb parentHref={studioBase} parentLabel="Content generator" current="Ebooks" />
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
                {askLoading ? "Thinking…" : "Ask AI for a topic"}
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
                Generate ebook
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
            badgeLabel="Ebook"
            title="Building your premium ebook"
            lead="Gemini 2.5 Pro is drafting a multi-chapter, lead-magnet ebook with real citations and your internal links woven in. This usually takes 3–6 minutes."
          />
        ) : phase === "review" ? (
          <ReviewView
            topic={topic}
            primaryKeyword={primaryKeyword}
            audience={audience}
            tone={EBOOK_TONES.find(t => t.id === tone)?.label ?? tone}
            depthLabel={EBOOK_DEPTH_OPTIONS.find(d => d.id === chapterDepth)?.label ?? chapterDepth}
            goal={goal}
            ctaObjective={ctaObjective}
            secondaryKeywords={secondaryKeywords}
            regionLabel={TARGET_REGIONS.find(r => r.code === region)?.name ?? region}
            languageLabel={EBOOK_LANG_OPTIONS.find(l => l.code === language)?.label ?? language}
          />
        ) : (
          <ContentForm>
            <ContentFormSection>
              <SectionHeading
                index="01"
                label="Ebook brief"
                hint="The angle, who it's for, and what it should accomplish."
              />
              <div className="space-y-5">
                <Field label="Ebook topic" required htmlFor="ebook-topic">
                  <Input
                    id="ebook-topic"
                    inputSize="lg"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="e.g. The 2026 RPO Buyer's Handbook"
                  />
                </Field>
                <ContentFormGrid cols={2}>
                  <Field label="Primary SEO keyword" required htmlFor="ebook-keyword">
                    <Input
                      id="ebook-keyword"
                      inputSize="lg"
                      value={primaryKeyword}
                      onChange={e => setPrimaryKeyword(e.target.value)}
                      placeholder="recruitment process outsourcing"
                    />
                  </Field>
                  <Field label="Target audience" required htmlFor="ebook-audience">
                    <Input
                      id="ebook-audience"
                      inputSize="lg"
                      value={audience}
                      onChange={e => setAudience(e.target.value)}
                      placeholder="Heads of Talent at 200–2,000 person companies"
                    />
                  </Field>
                </ContentFormGrid>
                <Field
                  label="Supporting / semantic keywords"
                  description="Optional. We weave these naturally across chapters — never as a list."
                  htmlFor="ebook-secondary-keywords"
                >
                  <KeywordChips
                    id="ebook-secondary-keywords"
                    value={secondaryKeywords}
                    onChange={setSecondaryKeywords}
                    placeholder="Type a keyword and press Enter…"
                  />
                </Field>
              </div>
            </ContentFormSection>

            <ContentFormSection>
              <SectionHeading index="02" label="Tone & depth" />
              <div className="space-y-5">
                <Field label="Tone">
                  <ChipChoice options={EBOOK_TONES.map(t => ({ id: t.id, label: t.label }))} value={tone} onChange={setTone} ariaLabel="Tone" />
                </Field>
                <Field label="Chapter depth">
                  <ChipChoice
                    options={EBOOK_DEPTH_OPTIONS.map(o => ({ id: o.id, label: o.label, hint: o.hint }))}
                    value={chapterDepth}
                    onChange={setChapterDepth}
                    ariaLabel="Chapter depth"
                  />
                </Field>
                <ContentFormGrid cols={2}>
                  <Field label="Region" htmlFor="ebook-region">
                    <Select id="ebook-region" inputSize="lg" value={region} onChange={e => setRegion(e.target.value)}>
                      {TARGET_REGIONS.map(r => (
                        <option key={r.code} value={r.code}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Language" htmlFor="ebook-language">
                    <Select
                      id="ebook-language"
                      inputSize="lg"
                      value={language}
                      onChange={e => setLanguage(e.target.value)}
                    >
                      {EBOOK_LANG_OPTIONS.map(l => (
                        <option key={l.code} value={l.code}>
                          {l.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </ContentFormGrid>
              </div>
            </ContentFormSection>

            <ContentFormSection>
              <SectionHeading
                index="03"
                label="Goal & CTA"
                hint="Tell the writer what success looks like — drives the closing chapter and CTA."
              />
              <div className="space-y-5">
                <Field label="Reader takeaway / goal" htmlFor="ebook-goal">
                  <Textarea
                    id="ebook-goal"
                    rows={3}
                    value={goal}
                    onChange={e => setGoal(e.target.value)}
                    placeholder="What should the reader walk away knowing or doing?"
                  />
                </Field>
                <Field label="CTA objective" htmlFor="ebook-cta">
                  <Textarea
                    id="ebook-cta"
                    rows={3}
                    value={ctaObjective}
                    onChange={e => setCtaObjective(e.target.value)}
                    placeholder="What action should the closing chapter steer the reader toward?"
                  />
                </Field>
              </div>
            </ContentFormSection>

            <Suspense fallback={<RecentHistorySkeleton />}>
              <RecentEbooksList projectId={projectId} studioBase={studioBase} />
            </Suspense>
          </ContentForm>
        )}
      </div>
    </div>
  );
}

function RecentEbooksList({ projectId, studioBase }: { projectId: string; studioBase: string }) {
  const { data: history } = useSuspenseQuery({
    queryKey: qk.contentStudioHistory(projectId),
    queryFn: () => contentGeneratorApi.studioHistory(projectId),
    ...DEFAULT_QUERY_OPTIONS,
  });

  const recentEbooks = useMemo(() => {
    const rows: ContentStudioHistoryRow[] = history?.success ? history.data : [];
    return rows.filter(r => r.content_type === "ebook").slice(0, 4);
  }, [history]);

  if (recentEbooks.length === 0) return null;

  return (
    <ContentFormSection>
      <SectionHeading index="04" label="Recent ebooks" hint="Continue from a draft or open the previewer." />
      <div className="grid gap-3 sm:grid-cols-2">
        {recentEbooks.map(r => (
          <ProjectNavLink
            key={r.id}
            href={`${studioBase}/ebooks/${r.id}`}
            className="group flex flex-col gap-1 rounded-card border border-border-subtle bg-surface-elevated p-4 transition-colors hover:border-border-strong"
          >
            <span className="text-[11px] font-mono uppercase tracking-widest text-text-tertiary">
              {new Date(r.updated_at).toLocaleDateString()}
            </span>
            <span className="text-[14px] font-semibold text-text-primary line-clamp-2">{r.title}</span>
            <span className="mt-1 inline-flex flex-wrap gap-2 text-[11px] text-text-tertiary">
              <span>{r.word_count.toLocaleString()} words</span>
              <span>·</span>
              <span>{r.target_keyword || "no primary keyword"}</span>
            </span>
          </ProjectNavLink>
        ))}
      </div>
    </ContentFormSection>
  );
}

function ReviewView({
  topic,
  primaryKeyword,
  audience,
  tone,
  depthLabel,
  goal,
  ctaObjective,
  secondaryKeywords,
  regionLabel,
  languageLabel,
}: {
  topic: string;
  primaryKeyword: string;
  audience: string;
  tone: string;
  depthLabel: string;
  goal: string;
  ctaObjective: string;
  secondaryKeywords: string[];
  regionLabel: string;
  languageLabel: string;
}) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Topic", value: topic },
    { label: "Primary keyword", value: primaryKeyword },
    { label: "Audience", value: audience },
    { label: "Tone", value: tone },
    { label: "Chapter depth", value: depthLabel },
    { label: "Region", value: regionLabel },
    { label: "Language", value: languageLabel },
  ];
  if (secondaryKeywords.length) {
    rows.push({
      label: "Supporting keywords",
      value: (
        <span className="flex flex-wrap gap-1.5">
          {secondaryKeywords.map(k => (
            <span key={k} className="rounded-full border border-border-subtle bg-surface-secondary px-2 py-0.5 text-[11px] text-text-secondary">
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
        <SectionHeading index="01" label="Ebook brief summary" />
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
        <SectionHeading index="02" label="Outcome the AI is optimising for" />
        <p className="text-[14px] leading-relaxed text-text-secondary">
          <strong className="text-text-primary">Reader goal:</strong> {goal}
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">
          <strong className="text-text-primary">CTA objective:</strong> {ctaObjective}
        </p>
        <p className="mt-4 text-[12px] leading-relaxed text-text-tertiary">
          On generate, the engine pulls live SERP context for the primary keyword, drops in your internal link
          pool from the project brief, and runs a Gemini 2.5 Pro pass. You&apos;ll land on the previewer when it&apos;s done.
        </p>
      </Card>
    </div>
  );
}
