"use client";

import { useParams } from "next/navigation";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { PageTitle } from "@/components/common";

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function IllustrationTenSteps() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full max-h-[140px]" fill="none" aria-hidden>
      <rect x="24" y="16" width="152" height="96" rx="8" className="stroke-text-tertiary/25" strokeWidth="1.5" />
      <path d="M40 36h120M40 52h96M40 68h108M40 84h72" className="stroke-text-tertiary/35" strokeWidth="2" strokeLinecap="round" />
      <path d="M148 88l12 12 8-16" className="stroke-violet-500 dark:stroke-violet-400" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IllustrationInstant() {
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full max-h-[140px]" fill="none" aria-hidden>
      <rect x="40" y="20" width="120" height="88" rx="10" className="stroke-text-tertiary/25" strokeWidth="1.5" />
      <circle cx="100" cy="64" r="22" className="stroke-violet-500/60 dark:stroke-violet-400/60" strokeWidth="2" />
      <circle cx="100" cy="64" r="8" className="fill-violet-500/20 stroke-violet-500 dark:fill-violet-400/20 dark:stroke-violet-400" strokeWidth="1.5" />
    </svg>
  );
}

export default function ContentGeneratorPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const base = `/projects/${projectId}`;

  return (
    <div className="space-y-10 pb-16 pl-4 pr-4">
      <div className="pt-4 pb-8 border-b border-border-subtle">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-[14px] text-text-tertiary">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-secondary px-3 py-1 font-mono text-[12px] uppercase tracking-widest text-text-secondary">
            <span className="h-2 w-2 rounded-full bg-brand-action" />
            Content generation
          </span>
        </div>
        <PageTitle>Start your article journey</PageTitle>
        <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-text-tertiary">
          Select the writing mode that best fits your needs and time constraints.
        </p>
      </div>

      <div className="mx-auto max-w-5xl">
        <h2 className="mb-6 font-mono text-[11px] font-normal uppercase tracking-widest text-text-secondary">Choose your writing mode</h2>

        <div className="grid gap-6 md:grid-cols-2">
        {/* 10-Steps Article — full flow not available yet */}
        <article
          className="flex flex-col overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated opacity-[0.92]"
          aria-label="10-Steps Article — coming soon"
        >
          <div className="relative bg-pink-100/90 px-6 pb-4 pt-8 dark:bg-pink-500/10">
            <span className="absolute left-4 top-4 inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">
              Coming soon
            </span>
            <div className="mx-auto flex h-[132px] items-center justify-center">
              <IllustrationTenSteps />
            </div>
          </div>

          <div className="flex flex-1 flex-col border-t border-border-subtle p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h3 className="text-[20px] font-bold text-text-primary">10-Steps Article</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100/60 px-2 py-0.5 text-[11px] font-semibold text-emerald-800/80 dark:bg-emerald-500/15 dark:text-emerald-400/80">
                <ClockIcon className="h-3.5 w-3.5" />
                5 mins
              </span>
            </div>

            <p className="mb-2 text-[13px] font-semibold text-text-secondary">Full control over:</p>
            <ul className="mb-8 flex-1 space-y-2 text-[14px] leading-snug text-text-tertiary">
              <li className="flex gap-2">
                <span className="text-violet-500 dark:text-violet-400">•</span>
                Article type (listicles, how-to guides, news, and more)
              </li>
              <li className="flex gap-2">
                <span className="text-violet-500 dark:text-violet-400">•</span>
                Reference and competitor selection
              </li>
              <li className="flex gap-2">
                <span className="text-violet-500 dark:text-violet-400">•</span>
                Keywords from your research workspace
              </li>
              <li className="flex gap-2">
                <span className="text-violet-500 dark:text-violet-400">•</span>
                Word length (500–5000 words)
              </li>
              <li className="flex gap-2">
                <span className="text-violet-500 dark:text-violet-400">•</span>
                Outline, writing style, and CTA
              </li>
              <li className="flex gap-2">
                <span className="text-violet-500 dark:text-violet-400">•</span>
                Images, FAQs, and other settings
              </li>
            </ul>

            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center rounded-full border border-border-subtle bg-surface-secondary py-3 text-[14px] font-medium text-text-tertiary"
            >
              Coming soon
            </button>
          </div>
        </article>

        {/* Instant Article */}
        <article className="flex flex-col overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated">
          <div className="relative bg-violet-100/80 px-6 pb-4 pt-8 dark:bg-violet-500/10">
            <div className="mx-auto flex h-[132px] items-center justify-center">
              <IllustrationInstant />
            </div>
          </div>

          <div className="flex flex-1 flex-col border-t border-border-subtle p-6">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h3 className="text-[20px] font-bold text-text-primary">Instant Article</h3>
              <span className="inline-flex rounded-full bg-violet-200/80 px-2 py-0.5 text-[11px] font-semibold text-violet-800 dark:bg-violet-500/25 dark:text-violet-200">
                Beta
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                <ClockIcon className="h-3.5 w-3.5" />
                1 min
              </span>
            </div>

            <p className="mb-2 text-[13px] font-semibold text-text-secondary">You provide:</p>
            <ul className="mb-8 flex-1 space-y-2 text-[14px] leading-snug text-text-tertiary">
              <li className="flex gap-2">
                <span className="text-violet-500 dark:text-violet-400">•</span>
                Topic or title
              </li>
              <li className="flex gap-2">
                <span className="text-violet-500 dark:text-violet-400">•</span>
                Article type (listicles, how-to guides, news, and more)
              </li>
              <li className="flex gap-2">
                <span className="text-violet-500 dark:text-violet-400">•</span>
                Keywords (optional)
              </li>
              <li className="flex gap-2">
                <span className="text-violet-500 dark:text-violet-400">•</span>
                Reference and competitor selection
              </li>
              <li className="flex gap-2">
                <span className="text-violet-500 dark:text-violet-400">•</span>
                We handle the rest
              </li>
            </ul>

            <ProjectNavLink
              href={`${base}/content-generator/instant`}
              className="flex w-full items-center justify-center rounded-full border border-brand-action bg-transparent py-3 text-[14px] font-medium text-text-primary transition-colors hover:bg-brand-action/10"
            >
              Click to start
            </ProjectNavLink>
          </div>
        </article>
        </div>
      </div>
    </div>
  );
}
