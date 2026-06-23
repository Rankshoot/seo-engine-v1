"use client";

import { useState } from "react";
import { notFound } from "next/navigation";
import ProjectSidebar from "./ProjectSidebar";
import { NavigationOverlay } from "@/components/NavigationOverlay";
import type { Project } from "@/lib/types";
import { useProject, useProjects } from "@/lib/query";

export default function ProjectLayoutClient({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Commented out to prevent duplicate API call in keyword discovery page
  // const { data: projectRes, isFetched } = useProject(projectId);
  const { data: projectsListRes } = useProjects();

  const allProjects = projectsListRes?.success && projectsListRes.data ? projectsListRes.data : [];
  const project: Project | null = allProjects.find(p => p.id === projectId) || null;

  // Only trigger notFound if the query finished and explicitly failed to find a project
  // if (isFetched && !project) {
  //   notFound();
  // }

  return (
    <div className="h-screen overflow-hidden bg-surface-primary flex">
      <ProjectSidebar
        project={project}
        projectId={projectId}
        stats={undefined}
        allProjects={allProjects}
        isCollapsed={isCollapsed}
        setIsCollapsed={setIsCollapsed}
      />
      <main
        className={`flex-1 min-w-0 overflow-y-auto transition-[margin] duration-300 ease-out ${
          isCollapsed ? "ml-[68px]" : "ml-[260px]"
        }`}
      >
        <div className="p-6 lg:p-8 min-h-full">
          {children}
        </div>
      </main>
      <NavigationOverlay />
    </div>
  );
}

