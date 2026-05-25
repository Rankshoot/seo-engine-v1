"use client";

import { useState, Suspense } from "react";
import { useParams } from "next/navigation";
import { PageTitle, Spinner } from "@/components/common";
import OrganicKeywordsTab from "./OrganicKeywordsTab";
import CompetitorKeywordsTab from "./CompetitorKeywordsTab";

export default function UnifiedKeywordDiscoveryPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<"organic" | "competitor">("organic");

  return (
    <div className="space-y-4 pb-16 relative">
      <header className="sticky top-0 z-40 bg-surface-primary/95 backdrop-blur-md px-4 pt-4 pb-4 border-b border-border-subtle">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <PageTitle>Keyword Discovery</PageTitle>
            <p className="mt-3 text-[15px] text-text-tertiary max-w-[600px]">
              Discover real search demand, analyze keyword difficulty, and identify competitor gaps to approve for your content calendar.
            </p>
          </div>
        </div>
      </header>

      <section className="space-y-4 pt-2 px-4">
        <div className="flex gap-2 border-b border-border-subtle pb-4">
          <button
            onClick={() => setActiveTab("organic")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "organic"
                ? "bg-brand-primary text-brand-on-primary"
                : "bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            }`}
          >
            Organic Keywords
          </button>
          <button
            onClick={() => setActiveTab("competitor")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "competitor"
                ? "bg-brand-primary text-brand-on-primary"
                : "bg-surface-secondary text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            }`}
          >
            Competitor Keywords
          </button>
        </div>

        <div>
          <Suspense fallback={<div className="py-12 flex justify-center"><Spinner size={24} /></div>}>
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
