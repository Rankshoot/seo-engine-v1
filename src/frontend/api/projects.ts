import type { Project } from "@/lib/types";
import type { ProjectSiteExplorerData, SiteExplorerTraceEntry } from "@/app/actions/project-actions";
import { apiDelete, apiGet, apiPatch, apiPost } from "./http";
import { V1Routes } from "./routes";

export type ProjectListResponse = { success: boolean; error?: string; data: Project[] };
export type ProjectOneResponse = { success: boolean; error?: string; data: Project | null };
export type ProjectStatsResponse = {
  success: boolean;
  error?: string;
  data: {
    totalKeywords: number;
    approvedKeywords: number;
    calendarEntries: number;
    blogsGenerated: number;
    articlesInLibrary: number;
    auditPending: number;
  } | null;
};

export type SiteExplorerApiResponse =
  | { success: true; data: ProjectSiteExplorerData; trace: SiteExplorerTraceEntry[] }
  | { success: false; error: string; data: null; trace: SiteExplorerTraceEntry[] };

export const projectsApi = {
  list(): Promise<ProjectListResponse> {
    return apiGet(V1Routes.projects);
  },

  get(projectId: string): Promise<ProjectOneResponse> {
    return apiGet(V1Routes.project(projectId));
  },

  create(payload: {
    name: string;
    domain: string;
    company: string;
    niche: string;
    target_audience: string;
    target_region: string;
    target_language: string;
    description: string;
    competitors: string[];
    ahrefs_rank_tracker_project_id?: number | null;
    brand_voice?: string;
    brand_values?: string;
    brand_description?: string;
  }): Promise<{ success: boolean; error?: string; data?: Project }> {
    return apiPost(V1Routes.projects, payload);
  },

  update(
    projectId: string,
    payload: {
      name: string;
      domain: string;
      company: string;
      niche: string;
      target_audience: string;
      target_region: string;
      description: string;
      competitors?: string[];
      ahrefs_rank_tracker_project_id?: number | null;
      brand_voice?: string;
      brand_values?: string;
      brand_description?: string;
    }
  ): Promise<{ success: boolean; error?: string; data?: Project }> {
    return apiPatch(V1Routes.project(projectId), payload);
  },

  delete(projectId: string): Promise<{ success: boolean; error?: string }> {
    return apiDelete(V1Routes.project(projectId));
  },

  stats(projectId: string): Promise<ProjectStatsResponse> {
    return apiGet(V1Routes.projectStats(projectId));
  },

  overviewSnapshot(projectId: string, opts?: { force?: boolean }): Promise<SiteExplorerApiResponse> {
    const q = opts?.force ? "?force=true" : "";
    return apiGet(`${V1Routes.projectOverview(projectId)}${q}`);
  },

  refreshOverview(projectId: string): Promise<SiteExplorerApiResponse> {
    return apiPost(V1Routes.projectOverviewRefresh(projectId));
  },

  saveBrand(
    projectId: string,
    payload: {
      brand_primary_color?: string | null;
      brand_secondary_color?: string | null;
      brand_accent_color?: string | null;
      brand_logo_url?: string | null;
      brand_visual_style?: string | null;
      brand_design_personality?: string | null;
      brand_image_style?: string | null;
      brand_palette_json?: string[] | null;
    }
  ): Promise<{ success: boolean; error?: string }> {
    return apiPatch(V1Routes.projectBrand(projectId), payload);
  },

  refreshBrand(projectId: string): Promise<{ success: boolean; error?: string; data?: Record<string, unknown> }> {
    return apiPost(V1Routes.projectBrandRefresh(projectId));
  },
};
