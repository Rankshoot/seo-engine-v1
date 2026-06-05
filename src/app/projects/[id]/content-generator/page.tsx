"use client";

import { useMemo, Suspense } from "react";
import { useParams } from "next/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { PageTitle } from "@/components/common";
import { contentGeneratorApi } from "@/frontend/api/content-generator";
import { qk, DEFAULT_QUERY_OPTIONS } from "@/lib/query";
import type { ContentType } from "@/lib/types";

interface ContentTypeCard {
  id: ContentType | "instant";
  href: string;
  badge?: string;
  duration: string;
  title: string;
  subtitle: string;
  bullets: string[];
  art: React.ReactNode;
  artBg: string;
  primary?: boolean;
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function ArtInstant() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full max-h-[140px]" fill="none" aria-hidden>
      <rect x="40" y="20" width="120" height="88" rx="10" className="stroke-text-tertiary/25" strokeWidth="1.5" />
      <circle cx="100" cy="64" r="22" className="stroke-violet-500/60 dark:stroke-violet-400/60" strokeWidth="2" />
      <circle cx="100" cy="64" r="8" className="fill-violet-500/20 stroke-violet-500 dark:fill-violet-400/20 dark:stroke-violet-400" strokeWidth="1.5" />
    </svg>
  );
}

function ArtEbook() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full max-h-[140px]" fill="none" aria-hidden>
      <rect x="36" y="14" width="60" height="92" rx="6" className="stroke-violet-500/60 dark:stroke-violet-400/60 fill-violet-500/8 dark:fill-violet-400/10" strokeWidth="1.5" />
      <rect x="100" y="14" width="60" height="92" rx="6" className="stroke-violet-400/40 dark:stroke-violet-300/40" strokeWidth="1.5" />
      <path d="M48 32h36M48 44h28M48 56h36M48 68h22" className="stroke-violet-500/70 dark:stroke-violet-300/70" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ArtWhitepaper() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full max-h-[140px]" fill="none" aria-hidden>
      <rect x="32" y="12" width="136" height="96" rx="6" className="stroke-blue-500/60 dark:stroke-blue-400/60" strokeWidth="1.5" />
      <path d="M48 32h104M48 46h84M48 60h104M48 74h64" className="stroke-blue-500/55 dark:stroke-blue-300/55" strokeWidth="2" strokeLinecap="round" />
      <rect x="48" y="86" width="56" height="14" rx="2" className="stroke-blue-500/45 dark:stroke-blue-300/45 fill-blue-500/8 dark:fill-blue-400/10" strokeWidth="1.5" />
    </svg>
  );
}

function ArtLinkedIn() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full max-h-[140px]" fill="none" aria-hidden>
      <rect x="24" y="14" width="152" height="92" rx="10" className="stroke-text-tertiary/25" strokeWidth="1.5" />
      <circle cx="48" cy="40" r="10" className="fill-cyan-500/15 stroke-cyan-500/60 dark:fill-cyan-400/20 dark:stroke-cyan-400/60" strokeWidth="1.5" />
      <path d="M64 36h72M64 46h52" className="stroke-text-tertiary/55" strokeWidth="2" strokeLinecap="round" />
      <path d="M40 64h120M40 76h96M40 88h60" className="stroke-text-tertiary/35" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function ContentGeneratorHubPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const base = `/projects/${projectId}`;
  const studioBase = `${base}/content-generator`;

  return (
    <div className="space-y-10 pb-16 pl-4 pr-4">
      <div className="pt-4 pb-8 border-b border-border-subtle">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-[14px] text-text-tertiary">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-secondary px-3 py-1 font-mono text-[12px] uppercase tracking-widest text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-brand-action" />
            AI content studio
          </span>
        </div>
        <PageTitle>What are you writing today?</PageTitle>
        <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-text-tertiary">
          Pick a content type. Every studio uses your project brief, approved keywords, and live research —
          so the draft sounds like your business, not a template.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ProjectNavLink
            href={`${studioBase}/history`}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-4 text-[13px] font-medium text-text-secondary transition-colors hover:border-border-default hover:text-text-primary"
          >
            <span className="h-2 w-2 rounded-full bg-brand-action" />
            View content history
          </ProjectNavLink>
        </div>
      </div>

      <div className="mx-auto max-w-6xl">
        <h2 className="mb-6 font-mono text-[11px] font-normal uppercase tracking-widest text-text-secondary">
          Choose your content type
        </h2>
        <Suspense fallback={<ContentCardsSkeleton />}>
          <ContentStudioCards projectId={projectId} studioBase={studioBase} />
        </Suspense>
      </div>
    </div>
  );
}

function ContentStudioCards({ projectId, studioBase }: { projectId: string; studioBase: string }) {
  const { data } = useSuspenseQuery({
    queryKey: qk.contentStudioHistory(projectId),
    queryFn: () => contentGeneratorApi.studioHistory(projectId),
    ...DEFAULT_QUERY_OPTIONS,
  });

  const counts = useMemo(() => {
    const map: Record<ContentType, number> = { blog: 0, ebook: 0, whitepaper: 0, linkedin: 0 };
    if (data?.success) {
      for (const r of data.data) map[r.content_type] = (map[r.content_type] ?? 0) + 1;
    }
    return map;
  }, [data]);

  const cards: ContentTypeCard[] = [
    {
      id: "instant",
      href: `${studioBase}/instant`,
      badge: "Beta",
      duration: "1 min",
      title: "Instant article",
      subtitle: "Topic in, draft out. Live web research + your brief.",
      bullets: [
        "Quickest path from a topic to a publishable post",
        "Live SERP context + Serper PAA included",
        "Optional custom PDF/DOCX/link sources",
        `${counts.blog} blog${counts.blog === 1 ? "" : "s"} in this project`,
      ],
      art: <ArtInstant />,
      artBg: "bg-violet-100/80 dark:bg-violet-500/10",
      primary: true,
    },
    {
      id: "ebook",
      href: `${studioBase}/ebooks`,
      badge: "Pro",
      duration: "3–6 min",
      title: "Ebooks",
      subtitle: "Long-form lead magnets with chapters, ToC, FAQs, references.",
      bullets: [
        "Powered by Gemini 2.5 Pro long-context",
        "Authoritative, citation-rich, premium UX",
        `${counts.ebook} in this project`,
      ],
      art: <ArtEbook />,
      artBg: "bg-violet-200/80 dark:bg-violet-500/15",
    },
    {
      id: "whitepaper",
      href: `${studioBase}/whitepapers`,
      badge: "Pro",
      duration: "4–8 min",
      title: "Whitepapers",
      subtitle: "Enterprise research with executive summary + roadmap.",
      bullets: [
        "EEAT-heavy, primary-source citations",
        "Methodology, findings, recommendations",
        `${counts.whitepaper} in this project`,
      ],
      art: <ArtWhitepaper />,
      artBg: "bg-blue-100/80 dark:bg-blue-500/10",
    },
    {
      id: "linkedin",
      href: `${studioBase}/linkedin`,
      duration: "30–60 sec",
      title: "LinkedIn posts",
      subtitle: "Hook-first, feed-native posts. No clichés. No hashtag spam.",
      bullets: [
        "Educational · founder · industry · storytelling · list · carousel",
        "Sized for LinkedIn's 1,300-char collapse limit",
        `${counts.linkedin} in this project`,
      ],
      art: <ArtLinkedIn />,
      artBg: "bg-cyan-100/80 dark:bg-cyan-500/10",
    },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {cards.map(card => (
        <ContentCard key={card.id} card={card} />
      ))}
    </div>
  );
}

function ContentCard({ card }: { card: ContentTypeCard }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated transition-all duration-200 ease-out hover:border-border-strong hover:shadow-(--shadow-sm)">
      <div className={`relative ${card.artBg} px-6 pb-4 pt-8`}>
        {card.badge ? (
          <span className="absolute left-4 top-4 inline-flex rounded-full bg-text-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-text-primary backdrop-blur">
            {card.badge}
          </span>
        ) : null}
        <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-text-primary/10 px-2 py-0.5 text-[11px] font-semibold text-text-primary backdrop-blur">
          <ClockIcon className="h-3 w-3" />
          {card.duration}
        </span>
        <div className="mx-auto flex h-[132px] items-center justify-center">{card.art}</div>
      </div>

      <div className="flex flex-1 flex-col border-t border-border-subtle p-6">
        <h3 className="text-[20px] font-bold text-text-primary">{card.title}</h3>
        <p className="mt-1 text-[13px] text-text-secondary">{card.subtitle}</p>
        <ul className="mt-4 mb-6 flex-1 space-y-2 text-[13px] leading-snug text-text-tertiary">
          {card.bullets.map((b, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-brand-action">•</span>
              {b}
            </li>
          ))}
        </ul>
        <ProjectNavLink
          href={card.href}
          className={
            card.primary
              ? "flex w-full items-center justify-center rounded-full bg-text-primary px-5 py-3 text-[14px] font-medium text-surface-primary no-underline transition-opacity hover:opacity-90"
              : "flex w-full items-center justify-center rounded-full border border-brand-action bg-transparent py-3 text-[14px] font-medium text-text-primary transition-colors hover:bg-brand-action/10"
          }
        >
          Open studio
        </ProjectNavLink>
      </div>
    </article>
  );
}

function ContentCardsSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 animate-pulse" aria-hidden="true">
      {[1, 2, 3, 4].map(idx => (
        <div key={idx} className="flex h-full flex-col overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated">
          <div className="relative bg-surface-secondary px-6 pb-4 pt-8 h-[180px] flex items-center justify-center">
            <div className="h-24 w-40 rounded bg-text-primary/10" />
          </div>
          <div className="flex flex-1 flex-col border-t border-border-subtle p-6 space-y-4">
            <div className="h-6 w-32 rounded bg-text-primary/10" />
            <div className="h-4 w-full rounded bg-text-primary/5" />
            <div className="space-y-2 py-2">
              <div className="h-3 w-4/5 rounded bg-text-primary/5" />
              <div className="h-3 w-3/4 rounded bg-text-primary/5" />
            </div>
            <div className="h-10 w-full rounded-full bg-text-primary/10 mt-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}
