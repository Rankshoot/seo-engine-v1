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
} from "@/components/content-generator/shared";
import { useProject, qk, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import { calendarApi } from "@/frontend/api/calendar";
import { contentGeneratorApi, type ContentStudioHistoryRow } from "@/frontend/api/content-generator";
import {
  LANDING_PAGE_TYPE_LABELS,
  type LandingPageType,
} from "@/lib/types";
import { generateLandingPageAction } from "@/app/actions/content-actions";
import { useUserQuota } from "@/hooks/useUserQuota";

type Phase = "form" | "review" | "generating";

const LP_TONES = [
  { id: "professional", label: "Professional" },
  { id: "conversational", label: "Conversational" },
  { id: "bold", label: "Bold" },
  { id: "friendly", label: "Friendly" },
];

export default function LandingPagesGeneratorPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { canGenerateBlog, quota, hasAiCredits } = useUserQuota();
  const base = `/projects/${projectId}`;
  const studioBase = `${base}/content-generator`;

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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
  const [secondaryKeywords, setSecondaryKeywords] = useState<string[]>([]);
  const [pageType, setPageType] = useState<LandingPageType>("service");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState<string>("professional");
  const [primaryCta, setPrimaryCta] = useState("Get started for free");
  const [productOrService, setProductOrService] = useState("");
  const [locationFocus, setLocationFocus] = useState("");
  const [uniqueValueProp, setUniqueValueProp] = useState("");
  const [askLoading, setAskLoading] = useState(false);

  const PAGE_TYPE_OPTIONS = Object.entries(LANDING_PAGE_TYPE_LABELS).map(([id, label]) => ({
    id: id as LandingPageType,
    label,
  }));

  useEffect(() => {
    if (project?.target_audience && !audience) {
      setAudience(project.target_audience);
    }
  }, [project?.target_audience, audience]);

  useEffect(() => {
    if (scheduledEntry) {
      if (scheduledEntry.focus_keyword && !keywordParam) setPrimaryKeyword(scheduledEntry.focus_keyword);
      if (scheduledEntry.secondary_keywords?.length) setSecondaryKeywords(scheduledEntry.secondary_keywords);
    }
  }, [scheduledEntry]);

  const emptyRequiredFields = useMemo(() => {
    const missing: string[] = [];
    if (!primaryKeyword.trim()) missing.push("Primary keyword");
    if (!audience.trim()) missing.push("Target audience");
    if (!primaryCta.trim()) missing.push("Primary CTA");
    return missing;
  }, [primaryKeyword, audience, primaryCta]);

  const isFormValid = emptyRequiredFields.length === 0;

  const goReview = () => {
    if (!isFormValid) {
      toast.error(`Please fill in: ${emptyRequiredFields.join(", ")}`);
      return;
    }
    setPhase("review");
  };

  const runGeneration = async () => {
    setPhase("generating");
    const res = await generateLandingPageAction(projectId, {
      primaryKeyword,
      secondaryKeywords,
      pageType,
      audience,
      tone: LP_TONES.find(t => t.id === tone)?.label ?? tone,
      primaryCta,
      productOrService: productOrService.trim() || undefined,
      locationFocus: locationFocus.trim() || undefined,
      uniqueValueProp: uniqueValueProp.trim() || undefined,
      entryId: entryId || null,
    });
    if (res.success) {
      toast.success("Landing page ready — opening preview.");
      void queryClient.invalidateQueries({ queryKey: qk.contentStudioHistory(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.contentGeneratorHistory(projectId) });
      router.push(`${studioBase}/landing-pages/${res.data.id}`);
    } else {
      toast.error(res.error);
      setPhase("form");
    }
  };

  const heroTitle = useMemo(() => {
    if (phase === "generating") return "Building your landing page";
    if (phase === "review") return "Review & generate";
    return "Landing page generator";
  }, [phase]);

  const heroLead = useMemo(() => {
    if (phase === "generating")
      return "AI is structuring your landing page with brand-matched sections, conversion copy, and SEO signals. Keep this tab open.";
    if (phase === "review")
      return "Confirm the brief. We'll produce a complete section-by-section landing page using your brand colours, voice, and keyword.";
    return "Configure your SEO landing page. Pick the page type, target keyword, and CTA — AI handles the rest.";
  }, [phase]);

  return (
    <div className={`relative space-y-10 pb-16 pl-4 pr-4 -mt-6 lg:-mt-8 ${mounted ? "animate-slide-in-right" : ""}`}>
      <div className="sticky -top-6 lg:-top-8 z-20 -mx-6 lg:-mx-8 border-b border-border-subtle bg-surface-primary/95 px-6 lg:px-8 pb-8 pt-6 lg:pt-8 backdrop-blur-sm">
        <StudioBreadcrumb parentHref={studioBase} parentLabel="Content generator" current="Landing pages" />
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-3xl">
            <PageTitle>{heroTitle}</PageTitle>
            <p className="mt-3 text-[16px] leading-relaxed text-text-tertiary">{heroLead}</p>
            {!canGenerateBlog && quota && (
              <div className="mt-3 text-[14px] text-rose-400 font-medium">
                Content limit reached. Upgrade your plan to generate more.
              </div>
            )}
          </div>
          {phase === "form" ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={goReview}
                disabled={!isFormValid || !canGenerateBlog}
                title={
                  !canGenerateBlog
                    ? "Content limit reached. Upgrade your plan to generate more."
                    : !isFormValid
                    ? `Required: ${emptyRequiredFields.join(", ")}`
                    : undefined
                }
                className={
                  "inline-flex h-10 items-center justify-center rounded-full px-5 text-[14px] font-semibold transition-all " +
                  (isFormValid && canGenerateBlog
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
                disabled={!canGenerateBlog}
              >
                Generate landing page
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl">
        {phase !== "generating" ? (
          <StepRow
            steps={[
              { id: "details", label: "Page brief" },
              { id: "review", label: "Review & generate" },
            ]}
            activeIndex={phase === "review" ? 1 : 0}
          />
        ) : null}

        {phase === "generating" ? (
          <GenerationProgress
            badgeLabel="Landing Page"
            title="Building your SEO landing page"
            lead="Structuring sections, writing conversion copy, and applying your brand style. Usually takes 30–90 seconds."
          />
        ) : phase === "review" ? (
          <ReviewView
            primaryKeyword={primaryKeyword}
            secondaryKeywords={secondaryKeywords}
            pageType={LANDING_PAGE_TYPE_LABELS[pageType]}
            audience={audience}
            tone={LP_TONES.find(t => t.id === tone)?.label ?? tone}
            primaryCta={primaryCta}
            productOrService={productOrService}
            locationFocus={locationFocus}
            uniqueValueProp={uniqueValueProp}
          />
        ) : (
          <ContentForm>
            <ContentFormSection>
              <SectionHeading
                index="01"
                label="Page brief"
                hint="The keyword, page type, and who you're targeting."
              />
              <div className="space-y-5">
                <Field label="Primary SEO keyword" required htmlFor="lp-keyword">
                  <Input
                    id="lp-keyword"
                    inputSize="lg"
                    value={primaryKeyword}
                    onChange={e => setPrimaryKeyword(e.target.value)}
                    placeholder="e.g. seo services for small businesses"
                    className={isKeywordTyping ? "ring-2 ring-brand-action/40 border-brand-action/50" : ""}
                  />
                </Field>
                <Field
                  label="Supporting / semantic keywords"
                  description="Optional. Woven naturally into the page copy."
                  htmlFor="lp-secondary-keywords"
                >
                  <KeywordChips
                    id="lp-secondary-keywords"
                    value={secondaryKeywords}
                    onChange={setSecondaryKeywords}
                    placeholder="Type a keyword and press Enter…"
                  />
                </Field>
                <ContentFormGrid cols={2}>
                  <Field label="Page type" htmlFor="lp-page-type">
                    <Select id="lp-page-type" inputSize="lg" value={pageType} onChange={e => setPageType(e.target.value as LandingPageType)}>
                      {PAGE_TYPE_OPTIONS.map(o => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Target audience" required htmlFor="lp-audience">
                    <Input
                      id="lp-audience"
                      inputSize="lg"
                      value={audience}
                      onChange={e => setAudience(e.target.value)}
                      placeholder="e.g. SaaS founders, local restaurant owners"
                    />
                  </Field>
                </ContentFormGrid>
              </div>
            </ContentFormSection>

            <ContentFormSection>
              <SectionHeading index="02" label="Tone & CTA" />
              <div className="space-y-5">
                <Field label="Tone">
                  <ChipChoice
                    options={LP_TONES}
                    value={tone}
                    onChange={setTone}
                    ariaLabel="Tone"
                  />
                </Field>
                <Field label="Primary CTA goal" required htmlFor="lp-cta">
                  <Input
                    id="lp-cta"
                    inputSize="lg"
                    value={primaryCta}
                    onChange={e => setPrimaryCta(e.target.value)}
                    placeholder="e.g. Get started for free, Book a demo, Contact us"
                  />
                </Field>
              </div>
            </ContentFormSection>

            <ContentFormSection>
              <SectionHeading
                index="03"
                label="Optional context"
                hint="More detail → sharper copy. Leave blank and AI infers from your project."
              />
              <div className="space-y-5">
                <ContentFormGrid cols={2}>
                  <Field label="Product / service name" htmlFor="lp-product">
                    <Input
                      id="lp-product"
                      inputSize="lg"
                      value={productOrService}
                      onChange={e => setProductOrService(e.target.value)}
                      placeholder="e.g. SEO Pro Suite, Taggd Premium"
                    />
                  </Field>
                  <Field label="Location focus" htmlFor="lp-location" description="For location-based landing pages">
                    <Input
                      id="lp-location"
                      inputSize="lg"
                      value={locationFocus}
                      onChange={e => setLocationFocus(e.target.value)}
                      placeholder="e.g. New York, London, San Francisco"
                    />
                  </Field>
                </ContentFormGrid>
                <Field label="Unique value proposition" htmlFor="lp-uvp">
                  <Textarea
                    id="lp-uvp"
                    rows={3}
                    value={uniqueValueProp}
                    onChange={e => setUniqueValueProp(e.target.value)}
                    placeholder="What makes you different? e.g. The only SEO tool built for agencies, with white-label reporting."
                  />
                </Field>
              </div>
            </ContentFormSection>

            <Suspense fallback={<RecentHistorySkeleton />}>
              <RecentLandingPagesList projectId={projectId} studioBase={studioBase} />
            </Suspense>
          </ContentForm>
        )}
      </div>
    </div>
  );
}

function RecentLandingPagesList({ projectId, studioBase }: { projectId: string; studioBase: string }) {
  const { data: history } = useSuspenseQuery({
    queryKey: qk.contentStudioHistory(projectId),
    queryFn: () => contentGeneratorApi.studioHistory(projectId),
    ...DEFAULT_QUERY_OPTIONS,
  });

  const recent = useMemo(() => {
    const rows: ContentStudioHistoryRow[] = history?.success ? history.data : [];
    return rows.filter(r => r.content_type === "landing_page").slice(0, 4);
  }, [history]);

  if (recent.length === 0) return null;

  return (
    <ContentFormSection>
      <SectionHeading index="04" label="Recent landing pages" hint="Open a draft to preview or edit." />
      <div className="grid gap-3 sm:grid-cols-2">
        {recent.map(r => (
          <ProjectNavLink
            key={r.id}
            href={`${studioBase}/landing-pages/${r.id}`}
            className="group flex flex-col gap-1 rounded-card border border-border-subtle bg-surface-elevated p-4 transition-colors hover:border-border-strong"
          >
            <span className="text-[11px] font-mono uppercase tracking-widest text-text-tertiary">
              {new Date(r.updated_at).toLocaleDateString()}
            </span>
            <span className="text-[14px] font-semibold text-text-primary line-clamp-2">{r.title}</span>
            <span className="mt-1 inline-flex flex-wrap gap-2 text-[11px] text-text-tertiary">
              <span>{r.target_keyword || "no primary keyword"}</span>
            </span>
          </ProjectNavLink>
        ))}
      </div>
    </ContentFormSection>
  );
}

function ReviewView({
  primaryKeyword,
  secondaryKeywords,
  pageType,
  audience,
  tone,
  primaryCta,
  productOrService,
  locationFocus,
  uniqueValueProp,
}: {
  primaryKeyword: string;
  secondaryKeywords: string[];
  pageType: string;
  audience: string;
  tone: string;
  primaryCta: string;
  productOrService: string;
  locationFocus: string;
  uniqueValueProp: string;
}) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Primary keyword", value: primaryKeyword },
    { label: "Page type", value: pageType },
    { label: "Audience", value: audience },
    { label: "Tone", value: tone },
    { label: "Primary CTA", value: primaryCta },
  ];
  if (productOrService) rows.push({ label: "Product / service", value: productOrService });
  if (locationFocus) rows.push({ label: "Location focus", value: locationFocus });
  if (uniqueValueProp) rows.push({ label: "Value proposition", value: uniqueValueProp });
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
        <SectionHeading index="01" label="Landing page brief" />
        <dl className="grid gap-5 sm:grid-cols-2">
          {rows.map(r => (
            <div key={r.label}>
              <dt className="font-mono text-[10px] font-medium uppercase tracking-widest text-text-tertiary">{r.label}</dt>
              <dd className="mt-1 wrap-break-word text-[14px] font-medium text-text-primary">{r.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card padding="md" elevation="flat">
        <SectionHeading index="02" label="What AI will produce" />
        <ul className="space-y-2 text-[14px] text-text-secondary leading-relaxed">
          <li className="flex gap-2"><span className="text-brand-action mt-0.5 shrink-0">•</span>A complete set of landing page sections (hero, features, FAQ, CTA, and more)</li>
          <li className="flex gap-2"><span className="text-brand-action mt-0.5 shrink-0">•</span>SEO-optimised meta title and meta description</li>
          <li className="flex gap-2"><span className="text-brand-action mt-0.5 shrink-0">•</span>Brand colours and visual style injected from your project profile</li>
          <li className="flex gap-2"><span className="text-brand-action mt-0.5 shrink-0">•</span>Real, specific copy — not placeholder text</li>
        </ul>
        <p className="mt-4 text-[12px] leading-relaxed text-text-tertiary">
          The result renders as a live preview with your brand palette. You can schedule it directly from the viewer.
        </p>
      </Card>
    </div>
  );
}
