"use client";

import { useState, useEffect } from "react";
import ProjectsClient from "@/components/projects/ProjectsClient";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import type { Project } from "@/lib/types";

export default function ProjectsPageClient({
  projects,
  initialNewModalOpen,
  userName = "",
}: {
  projects: Project[];
  initialNewModalOpen: boolean;
  userName?: string;
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

  // New user — no projects yet → show full-screen onboarding wizard
  if (projects.length === 0 && !initialNewModalOpen) {
    return <OnboardingFlow userName={userName} />;
  }

  return (
    <div className="min-h-screen bg-surface-primary">
      <main className="mx-auto max-w-[1320px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <ProjectsClient
          projects={projects}
          newProjectModalOpen={newProjectModalOpen}
          onNewProjectModalOpenChange={setNewProjectModalOpen}
          userName={userName}
        />
      </main>
    </div>
  );
}
