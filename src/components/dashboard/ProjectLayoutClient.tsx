"use client";

import { useState, Suspense, lazy } from "react";
import { notFound } from "next/navigation";
import ProjectSidebar from "./ProjectSidebar";
import type { Project } from "@/lib/types";
import { useProject, useProjects } from "@/lib/query";

// Lazy load AI Assistant to improve initial page load performance
const ContextualAIChatbot = lazy(() =>
  import("@/features/ai-assistant/components/ContextualAIChatbot").then(m => ({
    default: m.ContextualAIChatbot,
  }))
);

type AIMode = "closed" | "mini" | "full";

export default function ProjectLayoutClient({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [aiMode, setAiMode] = useState<AIMode>("closed");

  const { data: projectRes, isFetched } = useProject(projectId);
  const { data: projectsListRes } = useProjects();

  const project: Project | null =
    projectRes && projectRes.success && projectRes.data ? projectRes.data : null;

  // Only trigger notFound if the query finished and explicitly failed to find a project
  if (isFetched && !project) {
    notFound();
  }

  const allProjects = projectsListRes?.success && projectsListRes.data ? projectsListRes.data : [];

  return (
    <div className="h-screen overflow-hidden bg-surface-primary flex transition-all duration-300 ease-in-out">
      <ProjectSidebar
        project={project}
        projectId={projectId}
        stats={undefined}
        allProjects={allProjects}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
        onOpenAI={() => setAiMode("full")}
      />
      <main
        className={`flex-1 min-w-0 overflow-y-auto p-6 lg:p-8 transition-all duration-300 ease-in-out ${
          isCollapsed ? "ml-[80px]" : "ml-[280px]"
        }`}
      >
        {children}
        {project && aiMode !== "closed" && (
          <Suspense fallback={null}>
            <ContextualAIChatbot project={project} aiMode={aiMode} setAiMode={setAiMode} />
          </Suspense>
        )}
      </main>
    </div>
  );
}

