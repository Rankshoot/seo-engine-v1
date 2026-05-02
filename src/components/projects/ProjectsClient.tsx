"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import ProjectCard from "@/components/dashboard/ProjectCard";
import { PROJECT_CARD_GRID_HEIGHT_CLASS } from "@/components/dashboard/project-card-layout";
import { NewProjectModal } from "@/components/NewProjectModal";
import type { Project } from "@/lib/types";

export default function ProjectsClient({ projects }: { projects: Project[] }) {
  const [modalOpen, setModalOpen] = useState(false);
  const openModal = useCallback(() => setModalOpen(true), []);
  const closeModal = useCallback(() => setModalOpen(false), []);

  return (
    <>
      <div className="space-y-10 pb-16">

        {/* Header */}
        <div className="pt-4 pb-8 border-b border-border-subtle flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-[48px] font-normal tracking-[-0.96px] leading-none text-text-primary font-display">
              Projects
            </h1>
            <p className="mt-3 text-[16px] text-text-tertiary max-w-[600px]">
              Each project is a separate SEO campaign with its own keywords, calendar, and blogs.
            </p>
          </div>
          <button
            onClick={openModal}
            className="inline-flex items-center justify-center rounded-[32px] bg-brand-primary px-5 py-2.5 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90 shrink-0"
          >
            New Project
          </button>
        </div>

        {/* Grid */}
        {projects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {projects.map(project => (
              <ProjectCard key={project.id} project={project} />
            ))}
            {/* Add Project Card */}
            <button
              onClick={openModal}
              className={`rounded-[16px] border border-dashed border-border-strong bg-surface-secondary flex flex-col items-center justify-center gap-4 text-text-tertiary hover:border-brand-action hover:text-brand-action transition-all group ${PROJECT_CARD_GRID_HEIGHT_CLASS}`}
            >
              <div className="w-12 h-12 rounded-[8px] flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </div>
              <span className="text-[14px] font-medium">Create New Project</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center rounded-[22px] bg-surface-secondary border border-border-subtle">
            <div className="w-16 h-16 rounded-[16px] bg-surface-tertiary flex items-center justify-center text-text-primary mb-6 border border-border-subtle">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <h2 className="text-[28px] font-normal tracking-[-0.28px] text-text-primary mb-4 font-display">
              Create your first project
            </h2>
            <p className="text-[14px] text-text-tertiary max-w-md mb-8">
              A project holds everything for one SEO campaign — keywords, a 30-day content calendar, and AI-generated blogs ready to download.
            </p>
            <button
              onClick={openModal}
              className="inline-flex items-center justify-center rounded-[32px] bg-brand-primary px-6 py-3 text-[14px] font-medium text-brand-on-primary transition-opacity hover:opacity-90"
            >
              Create Project
            </button>
          </div>
        )}
      </div>

      <NewProjectModal open={modalOpen} onClose={closeModal} />
    </>
  );
}
