"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import ProjectSidebar from "./ProjectSidebar";
import type { Project } from "@/lib/types";
import { ContextualAIChatbot, type AIMode } from "@/features/ai-assistant/components/ContextualAIChatbot";
import { Skeleton } from "@/components/Skeleton";
import { useProject, useProjects } from "@/lib/query";
import { NewProjectModal } from "@/components/NewProjectModal";

/** Sidebar + main chrome while `qk.project` is still resolving (non-blocking layout). */
function ProjectLayoutShell({
  isCollapsed,
  setIsCollapsed,
  children,
}: {
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen overflow-hidden bg-surface-primary flex transition-all duration-300 ease-in-out">
      <aside
        className={`h-screen fixed left-0 top-0 border-r rounded-r-lg border-border-subtle bg-surface-secondary flex flex-col z-60 transition-all duration-300 ease-in-out ${
          isCollapsed ? "w-[80px]" : "w-[280px]"
        }`}
      >
        <div className={`p-6 pb-4 flex flex-col transition-all duration-300 ease-in-out ${isCollapsed ? "items-center px-2" : ""}`}>
          <div className={`flex items-center mb-8 relative w-full ${isCollapsed ? "justify-center" : "justify-between"}`}>
            <Skeleton className="h-8 w-28 shrink-0" rounded="lg" />
            {!isCollapsed ? (
              <button
                type="button"
                onClick={() => setIsCollapsed(true)}
                className="p-1.5 rounded-[8px] text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-colors shrink-0"
                title="Collapse sidebar"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsCollapsed(false)}
                className="absolute inset-0 m-auto w-8 h-8 flex items-center justify-center rounded-[8px] bg-surface-elevated border border-border-subtle text-text-primary shadow-sm z-10"
                title="Expand sidebar"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            )}
          </div>
          <Skeleton
            className={isCollapsed ? "h-14 w-14 shrink-0 rounded-full" : "h-[88px] w-full"}
            rounded={isCollapsed ? "full" : "lg"}
          />
        </div>
        <nav className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${isCollapsed ? "px-2" : "px-4"} space-y-2 mt-2`}>
          {[0, 1, 2, 3, 4, 5].map(i => (
            <Skeleton
              key={i}
              className={isCollapsed ? "h-11 w-11 mx-auto rounded-[8px]" : "h-11 w-full rounded-[8px]"}
              rounded="lg"
              style={{ animationDelay: `${i * 50}ms` }}
            />
          ))}
        </nav>
      </aside>
      <main
        className={`flex-1 min-w-0 overflow-y-auto p-6 lg:p-8 transition-all duration-300 ease-in-out ${
          isCollapsed ? "ml-[80px]" : "ml-[280px]"
        }`}
      >
        {children}
      </main>
    </div>
  );
}

export default function ProjectLayoutClient({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [aiMode, setAiMode] = useState<AIMode>("closed");
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);

  const { data: projectRes, isFetched } = useProject(projectId);
  const { data: projectsListRes } = useProjects();

  const project: Project | null =
    projectRes && projectRes.success && projectRes.data ? projectRes.data : null;

  if (!project) {
    if (!isFetched) {
      return (
        <ProjectLayoutShell isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed}>
          {children}
        </ProjectLayoutShell>
      );
    }
    notFound();
  }

  const allProjects = projectsListRes?.success && projectsListRes.data ? projectsListRes.data : [];

  return (
    <div className="h-screen overflow-hidden bg-surface-primary flex transition-all duration-300 ease-in-out">
      <ProjectSidebar
        project={project}
        stats={undefined}
        allProjects={allProjects}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        onOpenAI={() => setAiMode("full")}
        onNewProject={() => setNewProjectModalOpen(true)}
      />
      <main
        className={`flex-1 min-w-0 overflow-y-auto p-6 lg:p-8 transition-all duration-300 ease-in-out ${
          isCollapsed ? "ml-[80px]" : "ml-[280px]"
        }`}
      >
        {children}
        <ContextualAIChatbot project={project} aiMode={aiMode} setAiMode={setAiMode} />
        <NewProjectModal open={newProjectModalOpen} onClose={() => setNewProjectModalOpen(false)} />
      </main>
    </div>
  );
}
