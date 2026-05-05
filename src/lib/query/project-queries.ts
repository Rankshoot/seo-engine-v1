"use client";

import { useQuery } from "@tanstack/react-query";
import { briefApi } from "@/frontend/api/brief";
import { projectsApi } from "@/frontend/api/projects";
import { DEFAULT_QUERY_OPTIONS } from "./defaults";
import { qk } from "./keys";

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: qk.project(projectId!),
    queryFn: () => projectsApi.get(projectId!),
    enabled: !!projectId,
    ...DEFAULT_QUERY_OPTIONS,
  });
}

export function useProjects() {
  return useQuery({
    queryKey: qk.projects,
    queryFn: () => projectsApi.list(),
    ...DEFAULT_QUERY_OPTIONS,
  });
}

export function useProjectStats(projectId: string | undefined) {
  return useQuery({
    queryKey: qk.projectStats(projectId!),
    queryFn: () => projectsApi.stats(projectId!),
    enabled: !!projectId,
    ...DEFAULT_QUERY_OPTIONS,
  });
}

export function useBusinessBrief(projectId: string | undefined) {
  return useQuery({
    queryKey: qk.brief(projectId!),
    queryFn: () => briefApi.get(projectId!),
    enabled: !!projectId,
    ...DEFAULT_QUERY_OPTIONS,
  });
}
