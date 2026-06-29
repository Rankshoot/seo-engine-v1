"use client";

import { useState, useCallback } from "react";
import ProjectSidebar from "./ProjectSidebar";
import { NavigationOverlay } from "@/components/NavigationOverlay";
import { SitemapOnboardingDialog } from "@/components/sitemap/SitemapOnboardingDialog";
import type { Project } from "@/lib/types";
import { useProjects } from "@/lib/query";

export default function ProjectLayoutClient({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: projectsListRes } = useProjects();

  const allProjects = projectsListRes?.success && projectsListRes.data ? projectsListRes.data : [];
  const project: Project | null = allProjects.find(p => p.id === projectId) || null;

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <div className="h-screen overflow-hidden bg-surface-primary flex">
      {/* Mobile sidebar backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 sm:hidden"
          onClick={closeMobile}
          aria-hidden
        />
      )}

      <ProjectSidebar
        project={project}
        projectId={projectId}
        stats={undefined}
        allProjects={allProjects}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      <main
        className={`flex-1 min-w-0 h-full overflow-hidden transition-[margin] duration-300 ease-out sm:ml-[260px] ${
          isCollapsed ? "sm:ml-[68px]" : "sm:ml-[260px]"
        }`}
      >
        {/* Mobile top bar */}
        <div className="flex h-12 items-center justify-between border-b border-border-subtle bg-surface-primary/95 px-4 sm:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle bg-surface-secondary text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Open navigation"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <span className="text-[13px] font-semibold text-text-primary">{project?.name ?? "Loading…"}</span>
          <div className="w-8" />
        </div>

        <div className="h-[calc(100%-48px)] sm:h-full overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
      <NavigationOverlay />
      <SitemapOnboardingDialog projectId={projectId} />
    </div>
  );
}
