import { KeywordTableSkeleton } from "@/components/Skeleton";
import { KeywordsPageHeader, KeywordTabSwitcherPlaceholder } from "./_components/KeywordsPageHeader";

/**
 * Route-level fallback for keyword discovery. Renders the same static header as
 * the live page (heading shown immediately, never skeletoned) plus a static tab
 * switcher, and skeletons ONLY the table body — so navigating in shows one
 * skeleton in the exact position of the real table, with no header jump.
 */
export default function KeywordsLoading() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] relative bg-background">
      <KeywordsPageHeader tabs={<KeywordTabSwitcherPlaceholder />} />
      <section className="flex-1 flex flex-col min-h-0 px-2 pt-5">
        <KeywordTableSkeleton />
      </section>
    </div>
  );
}
