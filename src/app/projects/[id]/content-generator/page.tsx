"use client";

import { useMemo, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { Button, PageHeader } from "@/components/common";
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
    <svg viewBox="0 0 120 72" className="h-full w-full max-h-[72px]" fill="none" aria-hidden>
      <rect x="20" y="8" width="80" height="56" rx="8" className="stroke-text-tertiary/25" strokeWidth="1.5" />
      <circle cx="60" cy="36" r="14" className="stroke-brand-violet/60" strokeWidth="2" />
      <circle cx="60" cy="36" r="5" className="fill-brand-violet/20 stroke-brand-violet" strokeWidth="1.5" />
    </svg>
  );
}

function ArtEbook() {
  return (
    <svg viewBox="0 0 120 72" className="h-full w-full max-h-[72px]" fill="none" aria-hidden>
      <rect x="16" y="6" width="36" height="60" rx="4" className="stroke-brand-violet/60 fill-brand-violet/8" strokeWidth="1.5" />
      <rect x="54" y="6" width="36" height="60" rx="4" className="stroke-brand-violet/40" strokeWidth="1.5" />
      <path d="M22 18h24M22 26h18M22 34h24M22 42h14" className="stroke-brand-violet/70" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ArtWhitepaper() {
  return (
    <svg viewBox="0 0 120 72" className="h-full w-full max-h-[72px]" fill="none" aria-hidden>
      <rect x="12" y="6" width="96" height="60" rx="4" className="stroke-blue-500/60 dark:stroke-blue-400/60" strokeWidth="1.5" />
      <path d="M24 20h72M24 30h54M24 40h72M24 50h40" className="stroke-blue-500/55 dark:stroke-blue-300/55" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="24" y="56" width="36" height="8" rx="2" className="stroke-blue-500/45 dark:stroke-blue-300/45 fill-blue-500/8 dark:fill-blue-400/10" strokeWidth="1" />
    </svg>
  );
}

function ArtLinkedIn() {
  return (
    <svg viewBox="0 0 120 72" className="h-full w-full max-h-[72px]" fill="none" aria-hidden>
      <rect x="10" y="6" width="100" height="60" rx="8" className="stroke-text-tertiary/25" strokeWidth="1.5" />
      <circle cx="30" cy="24" r="7" className="fill-cyan-500/15 stroke-cyan-500/60 dark:fill-cyan-400/20 dark:stroke-cyan-400/60" strokeWidth="1.5" />
      <path d="M42 20h44M42 28h32" className="stroke-text-tertiary/55" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 42h80M20 50h64M20 58h40" className="stroke-text-tertiary/35" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function ContentGeneratorHubPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const base = `/projects/${projectId}`;
  const studioBase = `${base}/content-generator`;

  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        title="What are you writing today?"
        description="Pick a content type. Every studio uses your project brief, approved keywords, and live research — so the draft sounds like your business, not a template."
        actions={
          <>
            <ProjectNavLink
              href={`${studioBase}/history`}
              className="btn-secondary h-9 px-4 text-[13px]"
            >
              Content history
            </ProjectNavLink>
            <Button variant="primary" size="sm" onClick={() => router.push(`${studioBase}/blogs`)}>
              Start writing
            </Button>
          </>
        }
      />

      {/* Cards */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <h2 className="mb-5 font-mono text-[11px] font-normal uppercase tracking-widest text-text-tertiary">
          Choose your content type
        </h2>
        <Suspense fallback={<ContentCardsSkeleton />}>
          <ContentStudioCards projectId={projectId} studioBase={studioBase} />
        </Suspense>
      </motion.div>
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
      id: "blog",
      href: `${studioBase}/blogs`,
      duration: "1 min",
      title: "Blogs",
      subtitle: "Topic in, draft out. Live web research + your brief.",
      bullets: [
        "Quickest path from a topic to a publishable post",
        "Live SERP context + Serper PAA included",
        `${counts.blog} blog${counts.blog === 1 ? "" : "s"} in this project`,
      ],
      art: <ArtInstant />,
      artBg: "bg-brand-violet/10",
    },
    {
      id: "ebook",
      href: `${studioBase}/ebooks`,
      badge: "Pro",
      duration: "3–6 min",
      title: "Ebooks",
      subtitle: "Long-form lead magnets with chapters, ToC, FAQs.",
      bullets: [
        "Advanced AI long-context",
        "Authoritative, citation-rich",
        `${counts.ebook} in this project`,
      ],
      art: <ArtEbook />,
      artBg: "bg-brand-violet/15",
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
      subtitle: "Hook-first, feed-native posts. No clichés.",
      bullets: [
        "Educational · founder · storytelling · carousel",
        "Sized for LinkedIn's 1,300-char limit",
        `${counts.linkedin} in this project`,
      ],
      art: <ArtLinkedIn />,
      artBg: "bg-cyan-100/80 dark:bg-cyan-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card, i) => (
        <motion.div
          key={card.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
        >
          <ContentCard card={card} />
        </motion.div>
      ))}
    </div>
  );
}

function ContentCard({ card }: { card: ContentTypeCard }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-[14px] border border-border-subtle bg-surface-elevated transition-all duration-200 ease-out hover:border-border-strong hover:shadow-sm">
      {/* Art area */}
      <div className={`relative ${card.artBg} px-4 pb-3 pt-6`}>
        {card.badge ? (
          <span className="absolute left-3 top-3 inline-flex rounded-full bg-text-primary/10 px-2 py-0.5 text-[10px] font-semibold text-text-primary backdrop-blur">
            {card.badge}
          </span>
        ) : null}
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-text-primary/10 px-2 py-0.5 text-[10px] font-semibold text-text-primary backdrop-blur">
          <ClockIcon className="h-2.5 w-2.5" />
          {card.duration}
        </span>
        <div className="mx-auto flex h-[80px] items-center justify-center">{card.art}</div>
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col border-t border-border-subtle p-4">
        <h3 className="text-[16px] font-bold text-text-primary">{card.title}</h3>
        <p className="mt-0.5 text-[12px] text-text-secondary leading-snug">{card.subtitle}</p>
        <ul className="mt-3 mb-4 flex-1 space-y-1.5 text-[12px] leading-snug text-text-tertiary">
          {card.bullets.map((b, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-brand-action mt-0.5 shrink-0">•</span>
              {b}
            </li>
          ))}
        </ul>
        <ProjectNavLink
          href={card.href}
          className="flex w-full items-center justify-center rounded-full border border-border-default bg-transparent py-2 text-[13px] font-medium text-text-primary transition-colors hover:border-brand-action hover:bg-brand-action/8 hover:text-brand-action"
        >
          Open studio
        </ProjectNavLink>
      </div>
    </article>
  );
}

function ContentCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 animate-pulse" aria-hidden="true">
      {[1, 2, 3, 4].map(idx => (
        <div key={idx} className="flex h-full flex-col overflow-hidden rounded-[14px] border border-border-subtle bg-surface-elevated">
          <div className="relative bg-surface-secondary px-4 pb-3 pt-6 h-[120px] flex items-center justify-center">
            <div className="h-16 w-28 rounded bg-text-primary/10" />
          </div>
          <div className="flex flex-1 flex-col border-t border-border-subtle p-4 space-y-3">
            <div className="h-5 w-24 rounded bg-text-primary/10" />
            <div className="h-3 w-full rounded bg-text-primary/5" />
            <div className="space-y-1.5 py-1">
              <div className="h-2.5 w-4/5 rounded bg-text-primary/5" />
              <div className="h-2.5 w-3/4 rounded bg-text-primary/5" />
            </div>
            <div className="h-8 w-full rounded-full bg-text-primary/10 mt-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}
