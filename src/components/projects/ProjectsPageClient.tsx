"use client";

import { useState, useEffect, useCallback } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import ProjectsClient from "@/components/projects/ProjectsClient";
import type { Project } from "@/lib/types";

export default function ProjectsPageClient({
  projects,
  initialNewModalOpen,
}: {
  projects: Project[];
  initialNewModalOpen: boolean;
}) {
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(initialNewModalOpen);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    if (u.pathname !== "/projects" && u.pathname !== "/projects/") return;
    const n = u.searchParams.get("new");
    if (n === "1" || n === "true") {
      u.searchParams.delete("new");
      const qs = u.searchParams.toString();
      window.history.replaceState(null, "", `/projects${qs ? `?${qs}` : ""}`);
    }
  }, []);

  const openNewProject = useCallback(() => setNewProjectModalOpen(true), []);

  return (
    <div className="min-h-screen flex bg-surface-primary">
      <Sidebar onNewProject={openNewProject} />
      <main className="flex-1 min-w-0 ml-[280px] p-6 lg:p-8">
        <ProjectsClient
          projects={projects}
          newProjectModalOpen={newProjectModalOpen}
          onNewProjectModalOpenChange={setNewProjectModalOpen}
        />
      </main>
    </div>
  );
}
