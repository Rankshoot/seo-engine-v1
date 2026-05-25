"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { PageTitle } from "@/components/common";
import { CalendarTab } from "./CalendarTab";
import { HistoryTab } from "./HistoryTab";

type Tab = "calendar" | "generated";

export default function UnifiedContentHistoryPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<Tab>("calendar");

  return (
    <div className="space-y-8 pb-16 max-w-full px-4 mx-auto">
      <div className="pt-4 pb-6 border-b border-border-subtle flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <PageTitle>Content History</PageTitle>
          <p className="mt-3 text-[15px] text-text-tertiary max-w-[480px]">
            Manage your content pipeline. View scheduled calendar entries or track all generated content assets.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div
            className="inline-flex rounded-full border border-border-subtle bg-surface-secondary/70 p-0.5"
            role="tablist"
            aria-label="Content views"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "calendar"}
              onClick={() => setActiveTab("calendar")}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                activeTab === "calendar"
                  ? "bg-surface-elevated text-text-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              Scheduled Calendar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "generated"}
              onClick={() => setActiveTab("generated")}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold transition-colors ${
                activeTab === "generated"
                  ? "bg-surface-elevated text-text-primary shadow-sm"
                  : "text-text-tertiary hover:text-text-secondary"
              }`}
            >
              Generated Content
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4">
        {activeTab === "calendar" ? <CalendarTab /> : <HistoryTab />}
      </div>
    </div>
  );
}
