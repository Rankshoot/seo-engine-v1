"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
  suggestContentTopicAction,
} from "@/app/actions/content-actions";
import { calendarApi } from "@/frontend/api/calendar";
import { blogsApi } from "@/frontend/api/blogs";

const TONES = [
  { id: "premium-educational", label: "Premium · educational" },
  { id: "founder-narrative", label: "Founder · narrative" },
  { id: "analyst-formal", label: "Analyst · formal" },
  { id: "friendly-expert", label: "Friendly · expert" },
] as const;

const WORD_COUNT_OPTIONS = [
  { id: "1500", label: "Concise", hint: "~1,500 words" },
  { id: "2500", label: "Standard", hint: "~2,500 words" },
  { id: "3500", label: "Deep dive", hint: "~3,500+ words" },
] as const;

const LANG_OPTIONS = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "de", label: "German" },
  { code: "fr", label: "French" },
  { code: "hi", label: "Hindi" },
  { code: "pt", label: "Portuguese" },
] as const;

type Phase = "form" | "review" | "generating";

export default function BlogGeneratorPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const base = `/projects/${projectId}`;
  const studioBase = `${base}/content-generator`;

  const { data: projectRes } = useProject(projectId);
  const project = projectRes?.success ? projectRes.data : undefined;

  const [phase, setPhase] = useState<Phase>("form");
  const [topic, setTopic] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState(searchParams?.get("keyword") || "");
  const [secondaryKeywords, setSecondaryKeywords] = useState<string[]>([]);
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState<(typeof TONES)[number]["id"]>("premium-educational");
  const [goal, setGoal] = useState("Educate the reader and capture qualified leads.");
  const [ctaObjective, setCtaObjective] = useState(
    "Book a demo or download a deeper resource on our site.",
  );
  const [wordCount, setWordCount] = useState<number>(2500);
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
  const recentBlogs = useMemo(() => {
    const rows: ContentStudioHistoryRow[] = history?.success ? history.data : [];
    return rows.filter(r => r.content_type === "blog").slice(0, 4);
  }, [history]);

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

  const askAi = async () => {
    setAskLoading(true);
    try {
      const res = await suggestContentTopicAction(projectId, {
        contentType: "blog",
        avoidPhrases: secondaryKeywords,
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
    if (!topic.trim()) return toast.error("Add a topic or use Ask AI.");
    if (!primaryKeyword.trim()) return toast.error("Add the primary SEO keyword.");
    if (!audience.trim()) return toast.error("Describe your target audience.");
    setPhase("review");
  };

  const runGeneration = async () => {
    setPhase("generating");
    try {
      // 1. Create a calendar entry
      const calRes = await calendarApi.addCustomKeyword(projectId, {
        keyword: primaryKeyword,
        title: `[Draft] ${topic}`,
        articleType: "blog",
        writerNotes: `Audience: ${audience}\nTone: ${TONES.find(t => t.id === tone)?.label}\nGoal: ${goal}\nCTA: ${ctaObjective}\nSecondary Keywords: ${secondaryKeywords.join(", ")}`,
        targetDate: new Date().toISOString().split("T")[0],
      });
      
      if (!calRes.success) {
        toast.error(calRes.error || "Failed to schedule blog");
        setPhase("form");
        return;
      }

      // 2. Generate the blog
      const genRes = await blogsApi.generate({
        entryId: calRes.data.id,
        wordCount,
      });

      if (genRes.success) {
        toast.success("Blog ready — opening preview.");
        void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
        // Assuming we route to content history or the calendar.
        router.push(`${base}/content-history`);
      } else {
        toast.error(genRes.error || "Failed to generate blog");
        setPhase("form");
      }
    } catch (e) {
      toast.error("An error occurred during generation");
      setPhase("form");
    }
  };

  const heroTitle = useMemo(() => {
    if (phase === "generating") return "Drafting your blog";
    if (phase === "review") return "Review & generate";
    return "Blog generator";
  }, [phase]);

  const heroLead = useMemo(() => {
    if (phase === "generating")
      return "Gemini 2.5 Pro is synthesising live research, your brief, and approved keywords into a publication-ready blog post. Keep this tab open.";
    if (phase === "review")
      return "Confirm the angle. We'll run live SERP research, internal-link discovery, and a Pro-tier draft pass before saving.";
    return "Configure the blog angle, audience, and CTA. Ask AI to seed it from your project domain when you're not sure where to start.";
  }, [phase]);

  return (
    <div className="relative space-y-10 pb-16 pl-4 pr-4">
      <div className="border-b border-border-subtle pb-8 pt-4">
        <StudioBreadcrumb parentHref={studioBase} parentLabel="Content generator" current="Blogs" />
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
                Generate blog
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
            badgeLabel="Blog"
            title="Building your premium blog"
            lead="Gemini 2.5 Pro is drafting a high-ranking blog post with real citations and your internal links woven in. This usually takes 1–3 minutes."
          />
        ) : phase === "review" ? (
          <ReviewView
            topic={topic}
            primaryKeyword={primaryKeyword}
            audience={audience}
            tone={TONES.find(t => t.id === tone)?.label ?? tone}
            wordCount={wordCount}
            goal={goal}
            ctaObjective={ctaObjective}
            secondaryKeywords={secondaryKeywords}
            regionLabel={TARGET_REGIONS.find(r => r.code === region)?.name ?? region}
            languageLabel={LANG_OPTIONS.find(l => l.code === language)?.label ?? language}
          />
        ) : (
          <ContentForm>
            <ContentFormSection>
              <SectionHeading
                index="01"
                label="Blog brief"
                hint="The angle, who it's for, and what it should accomplish."
              />
              <div className="space-y-5">
                <Field label="Blog topic" required htmlFor="blog-topic">
                  <Input
                    id="blog-topic"
                    inputSize="lg"
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="e.g. 10 Trends Shaping Recruitment Process Outsourcing in 2026"
                  />
                </Field>
                <ContentFormGrid cols={2}>
                  <Field label="Primary SEO keyword" required htmlFor="blog-keyword">
                    <Input
                      id="blog-keyword"
                      inputSize="lg"
                      value={primaryKeyword}
                      onChange={e => setPrimaryKeyword(e.target.value)}
                      placeholder="recruitment process outsourcing"
                    />
                  </Field>
                  <Field label="Target audience" required htmlFor="blog-audience">
                    <Input
                      id="blog-audience"
                      inputSize="lg"
                      value={audience}
                      onChange={e => setAudience(e.target.value)}
                      placeholder="Heads of Talent at 200–2,000 person companies"
                    />
                  </Field>
                </ContentFormGrid>
                <Field
                  label="Supporting / semantic keywords"
                  description="Optional. We weave these naturally across the article — never as a list."
                  htmlFor="blog-secondary-keywords"
                >
                  <KeywordChips
                    id="blog-secondary-keywords"
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
                  <ChipChoice options={TONES.map(t => ({ id: t.id, label: t.label }))} value={tone} onChange={setTone} ariaLabel="Tone" />
                </Field>
                <Field label="Target word count">
                  <ChipChoice
                    options={WORD_COUNT_OPTIONS.map(o => ({ id: o.id, label: o.label, hint: o.hint }))}
                    value={String(wordCount)}
                    onChange={val => setWordCount(Number(val))}
                    ariaLabel="Target word count"
                  />
                </Field>
                <ContentFormGrid cols={2}>
                  <Field label="Region" htmlFor="blog-region">
                    <Select id="blog-region" inputSize="lg" value={region} onChange={e => setRegion(e.target.value)}>
                      {TARGET_REGIONS.map(r => (
                        <option key={r.code} value={r.code}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Language" htmlFor="blog-language">
                    <Select
                      id="blog-language"
                      inputSize="lg"
                      value={language}
                      onChange={e => setLanguage(e.target.value)}
                    >
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

            <ContentFormSection>
              <SectionHeading
                index="03"
                label="Goal & CTA"
                hint="Tell the writer what success looks like — drives the conclusion and CTA."
              />
              <div className="space-y-5">
                <Field label="Reader takeaway / goal" htmlFor="blog-goal">
                  <Textarea
                    id="blog-goal"
                    rows={3}
                    value={goal}
                    onChange={e => setGoal(e.target.value)}
                    placeholder="What should the reader walk away knowing or doing?"
                  />
                </Field>
                <Field label="CTA objective" htmlFor="blog-cta">
                  <Textarea
                    id="blog-cta"
                    rows={3}
                    value={ctaObjective}
                    onChange={e => setCtaObjective(e.target.value)}
                    placeholder="What action should the conclusion steer the reader toward?"
                  />
                </Field>
              </div>
            </ContentFormSection>

            {recentBlogs.length > 0 ? (
              <ContentFormSection>
                <SectionHeading index="04" label="Recent blogs" hint="Continue from a draft or open the previewer." />
                <div className="grid gap-3 sm:grid-cols-2">
                  {recentBlogs.map(r => (
                    <ProjectNavLink
                      key={r.id}
                      href={`${studioBase}/blogs/${r.id}`}
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
            ) : null}
          </ContentForm>
        )}
      </div>
    </div>
  );
}

function ReviewView({
  topic,
  primaryKeyword,
  audience,
  tone,
  wordCount,
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
  wordCount: number;
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
        <SectionHeading index="01" label="Blog brief summary" />
        <dl className="grid gap-5 sm:grid-cols-2">
          {rows.map(r => (
            <div key={r.label}>
              <dt className="font-mono text-[10px] font-medium uppercase tracking-widest text-text-tertiary">
                {r.label}
              </dt>
              <dd className="mt-1 wrap-break-word text-[14px] font-medium text-text-primary">{r.value}</dd>
            </div>
          ))}
          <div>
            <dt className="font-mono text-[10px] font-medium uppercase tracking-widest text-text-tertiary">
              Length
            </dt>
            <dd className="mt-1 wrap-break-word text-[14px] font-medium text-text-primary">{wordCount} words</dd>
          </div>
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
