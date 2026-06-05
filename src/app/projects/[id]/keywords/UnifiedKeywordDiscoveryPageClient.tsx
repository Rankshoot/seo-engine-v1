"use client";

import { useState, Suspense } from "react";
import dynamicComponent from "next/dynamic";
import { PageTitle } from "@/components/common";

const OrganicKeywordsTab = dynamicComponent(() => import("./OrganicKeywordsTab"), {
  ssr: false,
});
const CompetitorKeywordsTab = dynamicComponent(() => import("./CompetitorKeywordsTab"), {
  ssr: false,
});

interface UnifiedKeywordDiscoveryPageClientProps {
  readonly projectId: string;
}

export default function UnifiedKeywordDiscoveryPageClient({
  projectId,
}: UnifiedKeywordDiscoveryPageClientProps) {
  const [activeTab, setActiveTab] = useState<"organic" | "competitor">("organic");

  return (
    <div className="space-y-4 pb-16 relative">
      <header className="sticky -top-6 lg:-top-8 z-40 bg-surface-primary/95 backdrop-blur-md -mx-6 lg:-mx-8 -mt-6 lg:-mt-8 px-10 lg:px-12 pt-6 lg:pt-8 pb-4 border-b border-border-subtle">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <PageTitle>Keyword Discovery</PageTitle>
            <p className="mt-3 text-[15px] text-text-tertiary max-w-[600px]">
              Discover real search demand, analyze keyword difficulty, and identify competitor gaps to approve for your content calendar.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div
              className="inline-flex rounded-full border border-border-subtle bg-surface-secondary/70 p-0.5"
              role="tablist"
              aria-label="Keyword Discovery views"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "organic"}
                onClick={() => setActiveTab("organic")}
                className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                  activeTab === "organic"
                    ? "bg-surface-elevated text-text-primary shadow-sm"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                Organic Keywords
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "competitor"}
                onClick={() => setActiveTab("competitor")}
                className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                  activeTab === "competitor"
                    ? "bg-surface-elevated text-text-primary shadow-sm"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                Competitor Keywords
              </button>
            </div>
          </div>
        </div>
      </header>

      <section className="space-y-4 pt-2 px-4">
        <div>
          <Suspense fallback={<KeywordsTabSkeleton />}>
            {activeTab === "organic" ? (
              <OrganicKeywordsTab projectId={projectId} />
            ) : (
              <CompetitorKeywordsTab projectId={projectId} />
            )}
          </Suspense>
        </div>
      </section>
    </div>
  );
}

function KeywordsTabSkeleton() {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-elevated p-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-6 w-40 rounded-lg bg-surface-secondary" />
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-12 w-full rounded-lg bg-surface-secondary"
              style={{ animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
