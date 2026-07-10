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
import type { LinkedInPostStyle } from "@/lib/types";
import {
  generateLinkedInPostAction,
  suggestContentTopicAction,
  suggestTopicIdeasAction,
} from "@/app/actions/content-actions";
import { useUserQuota } from "@/hooks/useUserQuota";
import { useAppDispatch } from "@/lib/redux/hooks";
import { calendarRefreshBump } from "@/lib/redux/keyword-workspace-slice";
import {
  LINKEDIN_STYLE_OPTIONS,
  LINKEDIN_VOICE_OPTIONS,
  LINKEDIN_TONE_OPTIONS,
} from "@/constants";

type Phase = "form" | "review" | "generating";

export default function LinkedInGeneratorPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();
  const { canGenerateLinkedIn, quota, hasAiCredits } = useUserQuota();
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
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState(LINKEDIN_TONE_OPTIONS[0]);
  const [postStyle, setPostStyle] = useState<LinkedInPostStyle>("educational");
  const [voice, setVoice] = useState<"first_person" | "company">("first_person");
  const [authorRole, setAuthorRole] = useState("Founder");
  const [ctaObjective, setCtaObjective] = useState(
    "Spark a comment thread — invite the reader to share their take.",
  );
  const [region, setRegion] = useState("us");
  const [language, setLanguage] = useState("en");
  const [askLoading, setAskLoading] = useState(false);
  const [topicIdeasLoading, setTopicIdeasLoading] = useState(false);
  const [topicSuggestions, setTopicSuggestions] = useState<string[]>([]);
  const { isAiOwned, markUserOwned, canAutoFill, markAiFilled, markAutoFillable, fillFlashClass } = useAiFillTracker();

  // These start as sensible defaults — let auto-fill replace them until the
  // user changes them by hand.
  useEffect(() => {
    markAutoFillable(["cta", "tone", "postStyle", "voice", "authorRole"]);
  }, [markAutoFillable]);

  useEffect(() => {
    if (project?.target_audience && !audience) setAudience(project.target_audience);
    const tr = project?.target_region?.toLowerCase();
    if (tr && TARGET_REGIONS.some(r => r.code === tr)) setRegion(tr);
    const tl = project?.target_language?.toLowerCase();
    if (tl) setLanguage(tl);
  }, [project?.target_audience, project?.target_region, project?.target_language, audience]);

  useEffect(() => {
    if (scheduledEntry) {
      if (scheduledEntry.focus_keyword && !keywordParam) {
        setPrimaryKeyword(scheduledEntry.focus_keyword);
      }
      const realTitle = scheduledEntry.blog_title?.trim();
      if (realTitle) {
        setTopic(realTitle.replace(/^\[Draft\]\s*/, ""));
      }
    }
  }, [scheduledEntry]);

  // Compute which required fields are empty — drives CTA disabled state
  const emptyRequiredFields = useMemo(() => {
    const missing: string[] = [];
    if (!topic.trim()) missing.push("Post topic / angle");
    if (!primaryKeyword.trim()) missing.push("Primary keyword / theme");
    return missing;
  }, [topic, primaryKeyword]);

  const isFormValid = emptyRequiredFields.length === 0;

  // Auto-fill: completes only fields the user left empty (or defaults) —
  // user-typed values are passed as seeds and never replaced.
  const askAi = async () => {
    setAskLoading(true);
    try {
      const res = await suggestContentTopicAction(projectId, {
        contentType: "linkedin",
        avoidPhrases: [],
        seedKeyword: primaryKeyword.trim() && !isAiOwned("keyword") ? primaryKeyword.trim() : undefined,
        seedTopic: topic.trim() && !isAiOwned("topic") ? topic.trim() : undefined,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      const filled: string[] = [];
      if (res.topic && canAutoFill("topic", topic)) { setTopic(res.topic); filled.push("topic"); }
      if (res.primary_keyword && canAutoFill("keyword", primaryKeyword)) { setPrimaryKeyword(res.primary_keyword); filled.push("keyword"); }
      if (res.audience && canAutoFill("audience", audience)) { setAudience(res.audience); filled.push("audience"); }
      if (res.post_style && canAutoFill("postStyle", postStyle)) { setPostStyle(res.post_style as LinkedInPostStyle); filled.push("postStyle"); }
      if (res.voice && canAutoFill("voice", voice)) { setVoice(res.voice as "first_person" | "company"); filled.push("voice"); }
      if (res.author_role && canAutoFill("authorRole", authorRole)) { setAuthorRole(res.author_role); filled.push("authorRole"); }
      if (res.cta_objective && canAutoFill("cta", ctaObjective)) { setCtaObjective(res.cta_objective); filled.push("cta"); }
      if (res.tone && canAutoFill("tone", tone)) { setTone(res.tone); filled.push("tone"); }
      markAiFilled(filled);
      setTopicSuggestions(prev => Array.from(new Set([res.topic, ...prev].filter(Boolean))).slice(0, 4));
      toast.success(
        filled.length
          ? `AI filled ${filled.length} field${filled.length === 1 ? "" : "s"} — your entries were kept`
          : "Suggestion ready — pick a hook below the topic field"
      );
    } finally {
      setAskLoading(false);
    }
  };

  // "More ideas" under the topic field — ONLY refreshes the hook/topic
  // suggestion chips. Never touches keyword, audience, tone, voice, post
  // style, author role, or CTA, regardless of AI-fill ownership.
  const refreshTopicIdeas = async () => {
    setTopicIdeasLoading(true);
    try {
      const res = await suggestTopicIdeasAction(projectId, {
        contentType: "linkedin",
        seedKeyword: primaryKeyword.trim() || undefined,
        seedTopic: topic.trim() || undefined,
        audience: audience.trim() || undefined,
        tone,
        ctaObjective: ctaObjective.trim() || undefined,
        avoidTopics: topicSuggestions,
      });
      if (!res.success) { toast.error(res.error); return; }
      setTopicSuggestions(res.topics);
    } finally {
      setTopicIdeasLoading(false);
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
      entryId: entryId || null,
    });
    if (res.trace?.length) {
      console.log("[linkedin] trace:", res.trace);
    }
    if (res.success) {
      toast.success("LinkedIn post ready — opening preview.");
      void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
      if (entryId) {
        void queryClient.invalidateQueries({ queryKey: qk.calendar(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.calendarWithBlogs(projectId) });
        void queryClient.invalidateQueries({ queryKey: qk.projectStats(projectId) });
        dispatch(calendarRefreshBump({ projectId }));
      }
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
      ? "Crafting a feed-native, hook-first post sized for LinkedIn's 1,300-character collapse limit."
      : phase === "review"
        ? "Confirm the angle and tone. We'll draft a post tuned for engagement — no AI cliché, no hashtag spam."
        : "Tell us the angle, the audience, and the kind of post. The engine handles the hook, structure, and CTA.";

  return (
    <div className={`relative space-y-10 pb-16 pl-4 pr-4 ${mounted ? "animate-slide-in-right" : ""}`}>
      {!canGenerateLinkedIn && quota && (
        <div className="text-[14px] text-status-danger font-medium">
          LinkedIn post limit reached ({quota.linkedin.used}/{quota.linkedin.effectiveLimit}). Upgrade your plan to generate more LinkedIn posts.
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
                disabled={!isFormValid || !canGenerateLinkedIn}
                title={
                  !canGenerateLinkedIn
                    ? `LinkedIn post limit reached (${quota?.linkedin.used}/${quota?.linkedin.effectiveLimit}). Upgrade your plan to generate more.`
                    : !isFormValid
                    ? `Required: ${emptyRequiredFields.join(", ")}`
                    : undefined
                }
                className={
                  "inline-flex h-10 items-center justify-center rounded-full px-5 text-[14px] font-semibold transition-all " +
                  (isFormValid && canGenerateLinkedIn
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
                Back
              </Button>
              <Button
                variant="primary"
                shape="pill"
                size="lg"
                onClick={() => void runGeneration()}
                disabled={!canGenerateLinkedIn}
                title={
                  !canGenerateLinkedIn
                    ? `LinkedIn post limit reached (${quota?.linkedin.used}/${quota?.linkedin.effectiveLimit}). Upgrade your plan to generate more.`
                    : undefined
                }
              >
                Generate post
              </Button>
            </div>
          ) : null
        }
      />

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
            lead="Writing a hook-first, feed-native post — no clichés, ≤ 1,300 chars."
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
                { label: "Post style", value: LINKEDIN_STYLE_OPTIONS.find(s => s.id === postStyle)?.label ?? postStyle },
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
                    onChange={e => { setTopic(e.target.value); markUserOwned("topic"); }}
                    placeholder="Headline angle, observation, story prompt — anything to anchor the post."
                    className={fillFlashClass("topic")}
                  />
                  <TopicSuggestionChips
                    suggestions={topicSuggestions}
                    activeTopic={topic}
                    onPick={t => setTopic(t)}
                    onReload={() => void refreshTopicIdeas()}
                    loading={topicIdeasLoading}
                    label="AI hook ideas"
                  />
                </Field>
                <ContentFormGrid cols={2}>
                  <Field label="Primary keyword / theme" required htmlFor="li-keyword">
                    <Input
                      id="li-keyword"
                      inputSize="lg"
                      value={primaryKeyword}
                      onChange={e => { setPrimaryKeyword(e.target.value); markUserOwned("keyword"); }}
                      placeholder="ai content engine"
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
                  <Field label="Audience" htmlFor="li-audience">
                    <Input
                      id="li-audience"
                      inputSize="lg"
                      value={audience}
                      onChange={e => { setAudience(e.target.value); markUserOwned("audience"); }}
                      placeholder="Founders / Heads of Marketing"
                      className={fillFlashClass("audience")}
                    />
                  </Field>
                </ContentFormGrid>
              </div>
            </ContentFormSection>

            <ContentFormSection>
              <SectionHeading index="02" label="Style & voice" />
              <div className="space-y-5">
                <Field label="Post style">
                  <ChipChoice<LinkedInPostStyle> options={LINKEDIN_STYLE_OPTIONS} value={postStyle} onChange={v => { setPostStyle(v); markUserOwned("postStyle"); }} ariaLabel="Post style" />
                </Field>
                <Field label="Voice">
                  <ChipChoice options={LINKEDIN_VOICE_OPTIONS} value={voice} onChange={v => { setVoice(v); markUserOwned("voice"); }} ariaLabel="Voice" />
                </Field>
                {voice === "first_person" ? (
                  <Field label="Author role" htmlFor="li-author-role">
                    <Input
                      id="li-author-role"
                      inputSize="lg"
                      value={authorRole}
                      onChange={e => { setAuthorRole(e.target.value); markUserOwned("authorRole"); }}
                      placeholder="Founder · Head of Growth · CMO"
                      className={fillFlashClass("authorRole")}
                    />
                  </Field>
                ) : null}
                <Field label="Tone" htmlFor="li-tone">
                  <Select id="li-tone" inputSize="lg" value={tone} onChange={e => { setTone(e.target.value); markUserOwned("tone"); }}>
                    {LINKEDIN_TONE_OPTIONS.map(t => (
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
                    onChange={e => { setCtaObjective(e.target.value); markUserOwned("cta"); }}
                    placeholder="Comments? DMs? Share to colleagues? Visit a link in bio? Be specific."
                    className={fillFlashClass("cta")}
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

            <Suspense fallback={<RecentHistorySkeleton />}>
              <RecentLinkedInPostsList projectId={projectId} studioBase={studioBase} />
            </Suspense>
          </ContentForm>
        )}
      </div>
    </div>
  );
}

function RecentLinkedInPostsList({ projectId, studioBase }: { projectId: string; studioBase: string }) {
  const { data: history } = useSuspenseQuery({
    queryKey: qk.contentStudioHistory(projectId),
    queryFn: () => contentGeneratorApi.studioHistory(projectId),
    ...DEFAULT_QUERY_OPTIONS,
  });

  const recent = useMemo(() => {
    const rows: ContentStudioHistoryRow[] = history?.success ? history.data : [];
    return rows.filter(r => r.content_type === "linkedin").slice(0, 6);
  }, [history]);

  if (recent.length === 0) return null;

  return (
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
  );
}
