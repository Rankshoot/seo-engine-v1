"use client";

import { useState, useCallback } from "react";
import ProjectCard, { PROJECT_CARD_GRID_HEIGHT_CLASS } from "@/components/dashboard/ProjectCard";
import { NewProjectModal } from "@/components/NewProjectModal";
import type { Project } from "@/lib/types";
import { PageTitle, PageSubtitle, EmptyState, Button } from "@/components/common";

export default function ProjectsClient({
  projects,
  initialNewModalOpen = false,
  newProjectModalOpen: controlledOpen,
  onNewProjectModalOpenChange,
}: {
  projects: Project[];
  /** Used only when the modal is uncontrolled (no parent passes open/setter). */
  initialNewModalOpen?: boolean;
  newProjectModalOpen?: boolean;
  onNewProjectModalOpenChange?: (open: boolean) => void;
}) {
  const isControlled =
    typeof controlledOpen === "boolean" && typeof onNewProjectModalOpenChange === "function";
  const [uncontrolledOpen, setUncontrolledOpen] = useState(initialNewModalOpen);
  const modalOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const setModalOpen = useCallback(
    (v: boolean) => {
      if (isControlled) onNewProjectModalOpenChange!(v);
      else setUncontrolledOpen(v);
    },
    [isControlled, onNewProjectModalOpenChange]
  );
  const openModal = useCallback(() => setModalOpen(true), [setModalOpen]);
  const closeModal = useCallback(() => setModalOpen(false), [setModalOpen]);

  return (
    <>
      <div className="space-y-10 pb-16">

        {/* Header */}
        <header className="flex flex-col gap-6 border-b border-border-subtle pt-4 pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <PageTitle>Projects</PageTitle>
            <PageSubtitle>
              Each project is a separate SEO campaign with its own keywords, calendar, and blogs.
            </PageSubtitle>
          </div>
          <Button onClick={openModal} variant="primary" size="lg" shape="pill" className="shrink-0">
            New Project
          </Button>
        </header>

        {/* Grid */}
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {projects.map(project => (
              <ProjectCard key={project.id} project={project} />
            ))}
            <button
              onClick={openModal}
              className={`group flex flex-col items-center justify-center gap-4 rounded-card border border-dashed border-border-strong bg-surface-secondary text-text-tertiary transition-all duration-(--duration-base) ease-out hover:border-brand-action hover:text-brand-action ${PROJECT_CARD_GRID_HEIGHT_CLASS}`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-md transition-transform duration-(--duration-base) group-hover:scale-110">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <span className="text-[14px] font-medium">Create New Project</span>
            </button>
          </div>
        ) : (
          <EmptyState
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            }
            title="Create your first project"
            body="A project holds everything for one SEO campaign — keywords, a 30-day content calendar, and AI-generated blogs ready to download."
            action={
              <Button onClick={openModal} variant="primary" size="lg" shape="pill">
                Create Project
              </Button>
            }
          />
        )}
      </div>

      <NewProjectModal open={modalOpen} onClose={closeModal} />
    </>
  );
}
