"use client";

import { PageTitle } from "@/components/common";
import { HistoryTab } from "./HistoryTab";

export default function UnifiedContentHistoryPage() {
  return (
    <div className="space-y-8 pb-16 max-w-full px-4 mx-auto">
      <div className="pt-4 pb-6 border-b border-border-subtle flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <PageTitle>Content History</PageTitle>
          <p className="mt-3 text-[15px] text-text-tertiary max-w-[480px]">
            Track all generated content assets. Monitor status, details, and metrics for blogs, ebooks, whitepapers, and social posts.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <HistoryTab />
      </div>
    </div>
  );
}
