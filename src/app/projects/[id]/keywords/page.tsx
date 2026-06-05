import { Suspense } from "react";
import dynamicComponent from "next/dynamic";
import { KeywordTableSkeleton } from "@/components/Skeleton";
import { KeywordTabSwitcher } from "./KeywordTabSwitcher";

const OrganicKeywordsTab = dynamicComponent(() => import("./OrganicKeywordsTab"));
const CompetitorKeywordsTab = dynamicComponent(() => import("./CompetitorKeywordsTab"));

export const dynamic = "force-dynamic";

interface PageProps {
  readonly params: Promise<{ id: string }>;
  readonly searchParams: Promise<{ tab?: string }>;
}

export default async function UnifiedKeywordDiscoveryPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab = tab === "competitor" ? "competitor" : "organic";

  return (
    <div className="space-y-0 pb-16 relative">
      {/* ── Sticky Header ─────────────────────────────────────────────── */}
      <header className="sticky -top-6 lg:-top-8 z-40 bg-surface-primary/95 backdrop-blur-md -mx-6 lg:-mx-8 -mt-6 lg:-mt-8 px-6 lg:px-8 pt-6 lg:pt-8 pb-0">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          {/* Title area */}
          <div className="min-w-0 flex-1">
            {/* Eyebrow label */}
            <div className="mb-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-secondary px-3 py-1 font-mono text-[12px] uppercase tracking-widest text-text-secondary">
                <span className="h-2 w-2 rounded-full bg-brand-action" />
                Keyword Discovery
              </span>
            </div>

            <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-tight text-text-primary leading-none">
              Find & Schedule Keywords
            </h1>
            <p className="mt-2 text-[13px] text-text-tertiary max-w-[520px] leading-relaxed">
              Discover real search demand, analyze keyword difficulty, and identify competitor gaps to approve for your content calendar.
            </p>
          </div>

          {/* Tab switcher */}
          <div className="flex flex-wrap items-center gap-3 shrink-0 pb-1">
            <Suspense
              fallback={
                <div className="inline-flex rounded-[12px] border border-border-subtle bg-surface-secondary/60 p-1 gap-1">
                  <div className="h-9 w-36 rounded-[8px] bg-surface-elevated animate-pulse" />
                  <div className="h-9 w-40 rounded-[8px] bg-surface-elevated animate-pulse" />
                </div>
              }
            >
              <KeywordTabSwitcher projectId={id} activeTab={activeTab} />
            </Suspense>
          </div>
        </div>

        {/* Gradient separator — replaces the hard border */}
        <div className="mt-5 h-px bg-gradient-to-r from-transparent via-border-subtle to-transparent" />
        {/* Subtle brand glow under active area */}
        <div className="h-px bg-gradient-to-r from-transparent via-brand-action/20 to-transparent" />
      </header>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <section className="space-y-4 pt-5 px-0">
        <div className="w-full">
          <Suspense key={activeTab} fallback={<KeywordTableSkeleton />}>
            {activeTab === "organic" ? (
              <OrganicKeywordsTab projectId={id} />
            ) : (
              <CompetitorKeywordsTab projectId={id} />
            )}
          </Suspense>
        </div>
      </section>
    </div>
  );
}
