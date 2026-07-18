import { Suspense } from "react";
import dynamicComponent from "next/dynamic";
import { KeywordTableSkeleton } from "@/components/Skeleton";
import { KeywordTabSwitcher } from "./_components/KeywordTabSwitcher";
import { KeywordsPageHeader } from "./_components/KeywordsPageHeader";

const OrganicKeywordsTab = dynamicComponent(() => import("./_tabs/OrganicKeywordsTab"));
const CompetitorKeywordsTab = dynamicComponent(() => import("./_tabs/CompetitorKeywordsTab"));

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
    <div className="flex flex-col h-[calc(100vh-4rem)] relative bg-background">
      {/* ── Header (static — shared with loading.tsx) ─────────────────── */}
      <KeywordsPageHeader
        tabs={
          <Suspense
            fallback={
              <div className="inline-flex rounded-[12px] border border-border-subtle bg-surface-secondary/60 p-1 gap-1">
                <div className="h-9 w-36 rounded-[8px] bg-surface-tertiary animate-pulse" />
                <div className="h-9 w-40 rounded-[8px] bg-surface-tertiary animate-pulse" />
              </div>
            }
          >
            <KeywordTabSwitcher projectId={id} activeTab={activeTab} />
          </Suspense>
        }
      />

      {/* ── Content ───────────────────────────────────────────────────── */}
      <section className="flex-1 flex flex-col min-h-0 px-2 pt-5">
        <div className="w-full flex-1 flex flex-col min-h-0">
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
