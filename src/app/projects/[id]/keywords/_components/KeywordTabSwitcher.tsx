"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector, selectKeywordPrefs } from "@/lib/redux/hooks";
import { rememberKeywordMainTab, type KeywordDiscoveryMainTab } from "@/lib/redux/keyword-workspace-slice";

interface KeywordTabSwitcherProps {
  projectId: string;
  activeTab: KeywordDiscoveryMainTab;
}

export function KeywordTabSwitcher({ projectId, activeTab }: KeywordTabSwitcherProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefs = useAppSelector(state => selectKeywordPrefs(state, projectId));

  // On mount: if URL has no `tab` param but Redux remembers a non-default tab,
  // redirect the user to restore their last session.
  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (!urlTab && prefs.mainTab === "competitor") {
      router.replace(`/projects/${projectId}/keywords?tab=competitor`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Keep Redux in sync whenever the URL tab changes (covers browser back/forward).
  useEffect(() => {
    const urlTab = searchParams.get("tab") as KeywordDiscoveryMainTab | null;
    const resolved: KeywordDiscoveryMainTab = urlTab === "competitor" ? "competitor" : "organic";
    if (resolved !== prefs.mainTab) {
      dispatch(rememberKeywordMainTab({ projectId, tab: resolved }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const tabs: Array<{
    id: KeywordDiscoveryMainTab;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      id: "organic",
      label: "Organic Keywords",
      icon: (
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
      ),
    },
    {
      id: "competitor",
      label: "Competitor Keywords",
      icon: (
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605" />
        </svg>
      ),
    },
  ];

  const handleTabClick = (tab: KeywordDiscoveryMainTab) => {
    dispatch(rememberKeywordMainTab({ projectId, tab }));
  };

  return (
    <div
      className="relative grid grid-cols-2 w-[380px] rounded-[12px] border border-border-subtle bg-surface-secondary/60 p-1 gap-0.5 backdrop-blur-sm shadow-sm"
      role="tablist"
      aria-label="Keyword Discovery views"
    >
      {/* Sliding background pill */}
      <div
        className="absolute top-1 bottom-1 rounded-[9px] bg-surface-elevated shadow-sm ring-1 ring-border-subtle/80 transition-all duration-300 ease-out"
        style={{
          width: "calc(50% - 5px)",
          left: activeTab === "competitor" ? "calc(50% + 1px)" : "4px",
        }}
      />

      {tabs.map(tab => {
        const isActive = activeTab === tab.id;
        return (
          <Link
            key={tab.id}
            href={`/projects/${projectId}/keywords?tab=${tab.id}`}
            role="tab"
            aria-selected={isActive}
            onClick={() => handleTabClick(tab.id)}
            className={`relative flex items-center justify-center gap-2 rounded-[9px] px-3 py-2 text-[13px] font-semibold transition-all duration-200 select-none ${
              isActive
                ? "text-text-primary"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            <span
              className={`transition-colors duration-200 ${
                isActive ? "text-brand-action" : "opacity-60"
              }`}
            >
              {tab.icon}
            </span>
            <span className="whitespace-nowrap">{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
