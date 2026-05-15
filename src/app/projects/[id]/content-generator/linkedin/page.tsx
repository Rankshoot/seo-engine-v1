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
  SectionHeading,
  StepRow,
  StudioBreadcrumb,
} from "@/components/content-generator/shared";
import { useProject, qk } from "@/lib/query";
import { contentGeneratorApi, type ContentStudioHistoryRow } from "@/frontend/api/content-generator";
import { TARGET_REGIONS } from "@/lib/types";
import type { LinkedInPostStyle } from "@/lib/types";
import {
  generateLinkedInPostAction,
  suggestContentTopicAction,
} from "@/app/actions/content-actions";

const STYLE_OPTIONS: { id: LinkedInPostStyle; label: string; hint: string }[] = [
  { id: "educational", label: "Educational", hint: "Counter-intuitive insight + a frame the reader keeps" },
  { id: "founder", label: "Founder", hint: "Real, specific moment + the lesson" },
  { id: "industry_insight", label: "Industry insight", hint: "Fresh data + what most miss" },
  { id: "storytelling", label: "Storytelling", hint: "Three short scenes — implicit lesson" },
  { id: "list", label: "List", hint: "5–8 short items + meta lesson" },
  { id: "carousel", label: "Carousel-ready", hint: "6–9 chunks, slide-sized" },
];

const VOICE_OPTIONS = [
  { id: "first_person" as const, label: "First person", hint: "Sounds like a founder writing" },
  { id: "company" as const, label: "Brand voice", hint: "Sounds like the company" },
];

const TONE_OPTIONS = [
  "Confident · plain-spoken",
  "Curious · analytical",
  "Provocative · sharp",
  "Warm · human",
  "Numbers-first · precise",
];

type Phase = "form" | "review" | "generating";

export default function LinkedInGeneratorPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const studioBase = `/projects/${projectId}/content-generator`;

  const { data: projectRes } = useProject(projectId);
  const project = projectRes?.success ? projectRes.data : undefined;

  const [phase, setPhase] = useState<Phase>("form");
  const [topic, setTopic] = useState("");
  const [primaryKeyword, setPrimaryKeyword] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState(TONE_OPTIONS[0]);
  const [postStyle, setPostStyle] = useState<LinkedInPostStyle>("educational");
  const [voice, setVoice] = useState<"first_person" | "company">("first_person");
  const [authorRole, setAuthorRole] = useState("Founder");
  const [ctaObjective, setCtaObjective] = useState(
    "Spark a comment thread — invite the reader to share their take.",
  );
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
    return rows.filter(r => r.content_type === "linkedin").slice(0, 6);
  }, [history]);

  useEffect(() => {
    if (project?.target_audience && !audience) setAudience(project.target_audience);
    const tr = project?.target_region?.toLowerCase();
    if (tr && TARGET_REGIONS.some(r => r.code === tr)) setRegion(tr);
    const tl = project?.target_language?.toLowerCase();
    if (tl) setLanguage(tl);
  }, [project?.target_audience, project?.target_region, project?.target_language, audience]);

  const askAi = async () => {
    setAskLoading(true);
    try {
      const res = await suggestContentTopicAction(projectId, {
        contentType: "linkedin",
        avoidPhrases: [],
      });
      if (res.success) {
        setTopic(res.topic);
        setPrimaryKeyword(res.primary_keyword);
        toast.success("Hook angle filled");
      } else {
        toast.error(res.error);
      }
    } finally {
      setAskLoading(false);
    }
  };

  const goReview = () => {
    if (!topic.trim()) return toast.error("Add a topic or use Ask AI.");
    if (!primaryKeyword.trim()) return toast.error("Add the primary keyword.");
    setPhase("review");
  };

  const runGeneration = async () => {
    setPhase("generating");
    const res = await generateLinkedInPostAction(projectId, {
      topic,
      primaryKeyword,
      audience: audience || project?.target_audience || "Founders and operators",
      tone,
      postStyle,
      voicePerspective: voice,
      authorRole: voice === "first_person" ? authorRole : undefined,
      ctaObjective,
      region,
      language,
    });
    if (res.trace?.length) {
      console.log("[linkedin] trace:", res.trace);
    }
    if (res.success) {
      toast.success("LinkedIn post ready — opening preview.");
      void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
      router.push(`${studioBase}/linkedin/${res.data.id}`);
    } else {
      toast.error(res.error);
      setPhase("form");
    }
  };

  const heroTitle =
    phase === "generating" ? "Drafting your LinkedIn post" : phase === "review" ? "Review & generate" : "LinkedIn post generator";
  const heroLead =
    phase === "generating"
      ? "Gemini 2.5 Pro is crafting a feed-native, hook-first post sized for LinkedIn's 1,300-character collapse limit."
      : phase === "review"
        ? "Confirm the angle and tone. We'll draft a post tuned for engagement — no AI cliché, no hashtag spam."
        : "Tell us the angle, the audience, and the kind of post. The engine handles the hook, structure, and CTA.";

  return (
    <div className="relative space-y-10 pb-16 pl-4 pr-4">
      <div className="border-b border-border-subtle pb-8 pt-4">
        <StudioBreadcrumb parentHref={studioBase} parentLabel="Content generator" current="LinkedIn posts" />
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
                {askLoading ? "Thinking…" : "Ask AI for a hook"}
              </Button>
              <Button variant="primary" shape="pill" size="lg" onClick={goReview}>
                Review &amp; continue
              </Button>
            </div>
          ) : phase === "review" ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" shape="pill" size="lg" onClick={() => setPhase("form")}>
                Back
              </Button>
              <Button variant="primary" shape="pill" size="lg" onClick={() => void runGeneration()}>
                Generate post
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl">
        {phase !== "generating" ? (
          <StepRow
            steps={[
              { id: "details", label: "Hook & style" },
              { id: "review", label: "Review & generate" },
            ]}
            activeIndex={phase === "review" ? 1 : 0}
          />
        ) : null}

        {phase === "generating" ? (
          <GenerationProgress
            badgeLabel="LinkedIn post"
            title="Building your LinkedIn post"
            lead="Gemini 2.5 Pro is writing a hook-first, feed-native post — no clichés, ≤ 1,300 chars."
            stages={[
              { id: "context", label: "Loading project brief", weight: 0.1 },
              { id: "hook", label: "Drafting the hook", weight: 0.25 },
              { id: "body", label: "Building the body", weight: 0.45 },
              { id: "polish", label: "CTA + hashtags polish", weight: 0.2 },
            ]}
          />
        ) : phase === "review" ? (
          <Card padding="lg" elevation="raised">
            <SectionHeading index="01" label="Review" />
            <dl className="grid gap-5 sm:grid-cols-2">
              {[
                { label: "Topic", value: topic },
                { label: "Primary keyword", value: primaryKeyword },
                { label: "Audience", value: audience },
                { label: "Tone", value: tone },
                { label: "Post style", value: STYLE_OPTIONS.find(s => s.id === postStyle)?.label ?? postStyle },
                {
                  label: "Voice",
                  value:
                    voice === "first_person"
                      ? `First person — ${authorRole || "founder"}`
                      : "Brand voice",
                },
                { label: "CTA objective", value: ctaObjective },
                { label: "Region", value: TARGET_REGIONS.find(r => r.code === region)?.name ?? region },
              ].map(r => (
                <div key={r.label}>
                  <dt className="font-mono text-[10px] font-medium uppercase tracking-widest text-text-tertiary">
                    {r.label}
                  </dt>
                  <dd className="mt-1 wrap-break-word text-[14px] font-medium text-text-primary">{r.value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ) : (
          <ContentForm>
            <ContentFormSection>
              <SectionHeading index="01" label="Hook & angle" hint="What you'd post about today." />
              <div className="space-y-5">
                <Field label="What's the post about?" required htmlFor="li-topic">
                  <Textarea
                    id="li-topic"
                    rows={2}
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="Headline angle, observation, story prompt — anything to anchor the post."
                  />
                </Field>
                <ContentFormGrid cols={2}>
                  <Field label="Primary keyword / theme" required htmlFor="li-keyword">
                    <Input
                      id="li-keyword"
                      inputSize="lg"
                      value={primaryKeyword}
                      onChange={e => setPrimaryKeyword(e.target.value)}
                      placeholder="ai content engine"
                    />
                  </Field>
                  <Field label="Audience" htmlFor="li-audience">
                    <Input
                      id="li-audience"
                      inputSize="lg"
                      value={audience}
                      onChange={e => setAudience(e.target.value)}
                      placeholder="Founders / Heads of Marketing"
                    />
                  </Field>
                </ContentFormGrid>
              </div>
            </ContentFormSection>

            <ContentFormSection>
              <SectionHeading index="02" label="Style & voice" />
              <div className="space-y-5">
                <Field label="Post style">
                  <ChipChoice<LinkedInPostStyle> options={STYLE_OPTIONS} value={postStyle} onChange={setPostStyle} ariaLabel="Post style" />
                </Field>
                <Field label="Voice">
                  <ChipChoice options={VOICE_OPTIONS} value={voice} onChange={setVoice} ariaLabel="Voice" />
                </Field>
                {voice === "first_person" ? (
                  <Field label="Author role" htmlFor="li-author-role">
                    <Input
                      id="li-author-role"
                      inputSize="lg"
                      value={authorRole}
                      onChange={e => setAuthorRole(e.target.value)}
                      placeholder="Founder · Head of Growth · CMO"
                    />
                  </Field>
                ) : null}
                <Field label="Tone" htmlFor="li-tone">
                  <Select id="li-tone" inputSize="lg" value={tone} onChange={e => setTone(e.target.value)}>
                    {TONE_OPTIONS.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </ContentFormSection>

            <ContentFormSection>
              <SectionHeading index="03" label="CTA & locale" />
              <div className="space-y-5">
                <Field label="CTA objective" htmlFor="li-cta">
                  <Textarea
                    id="li-cta"
                    rows={2}
                    value={ctaObjective}
                    onChange={e => setCtaObjective(e.target.value)}
                    placeholder="Comments? DMs? Share to colleagues? Visit a link in bio? Be specific."
                  />
                </Field>
                <ContentFormGrid cols={2}>
                  <Field label="Region" htmlFor="li-region">
                    <Select id="li-region" inputSize="lg" value={region} onChange={e => setRegion(e.target.value)}>
                      {TARGET_REGIONS.map(r => (
                        <option key={r.code} value={r.code}>
                          {r.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Language" htmlFor="li-language">
                    <Select id="li-language" inputSize="lg" value={language} onChange={e => setLanguage(e.target.value)}>
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="de">German</option>
                      <option value="fr">French</option>
                      <option value="hi">Hindi</option>
                    </Select>
                  </Field>
                </ContentFormGrid>
              </div>
            </ContentFormSection>

            {recent.length > 0 ? (
              <ContentFormSection>
                <SectionHeading index="04" label="Recent posts" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {recent.map(r => (
                    <ProjectNavLink
                      key={r.id}
                      href={`${studioBase}/linkedin/${r.id}`}
                      className="group flex flex-col gap-1 rounded-card border border-border-subtle bg-surface-elevated p-4 transition-colors hover:border-border-strong"
                    >
                      <span className="text-[11px] font-mono uppercase tracking-widest text-text-tertiary">
                        {new Date(r.updated_at).toLocaleDateString()}
                      </span>
                      <span className="text-[14px] font-semibold text-text-primary line-clamp-3">{r.title}</span>
                      <span className="mt-1 text-[11px] text-text-tertiary">
                        {r.word_count.toLocaleString()} words
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
