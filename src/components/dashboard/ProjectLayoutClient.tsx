"use client";

import { useState } from "react";
import ProjectSidebar from "./ProjectSidebar";
import { Project } from "@/lib/types";
import { ContextualAIChatbot, type AIMode } from "@/features/ai-assistant/components/ContextualAIChatbot";

export default function ProjectLayoutClient({
  project,
  stats,
  allProjects,
  children,
}: {
  project: Project;
  stats?: { approvedKeywords: number; calendarEntries: number; blogsGenerated: number; auditPending?: number };
  allProjects: Project[];
  children: React.ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [aiMode, setAiMode] = useState<AIMode>("closed");

  return (
    <div className="h-screen overflow-hidden bg-surface-primary flex transition-all duration-300 ease-in-out">
      <ProjectSidebar 
        project={project} 
        stats={stats} 
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
        <ContextualAIChatbot
          project={project}
          aiMode={aiMode}
          setAiMode={setAiMode}
        />
      </main>
    </div>
  );
}
