import { Suspense } from "react";
import Link from "next/link";
import dynamicComponent from "next/dynamic";
import { PageTitle } from "@/components/common";
import { KeywordTableSkeleton } from "@/components/Skeleton";

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
              <Link
                href={`/projects/${id}/keywords?tab=organic`}
                role="tab"
                aria-selected={activeTab === "organic"}
                className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                  activeTab === "organic"
                    ? "bg-surface-elevated text-text-primary shadow-sm"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                Organic Keywords
              </Link>
              <Link
                href={`/projects/${id}/keywords?tab=competitor`}
                role="tab"
                aria-selected={activeTab === "competitor"}
                className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                  activeTab === "competitor"
                    ? "bg-surface-elevated text-text-primary shadow-sm"
                    : "text-text-tertiary hover:text-text-secondary"
                }`}
              >
                Competitor Keywords
              </Link>
            </div>
          </div>
        </div>
      </header>

      <section className="space-y-4 pt-2 px-4">
        <div className="h-96 w-full">
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

