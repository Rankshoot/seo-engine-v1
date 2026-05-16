"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import type { AdminListParams } from "@/lib/admin/parse-list-params";
import type { AdminProjectRow, AdminProjectsListResult } from "@/types/admin-projects";

type ProjectRow = {
  id: string;
  name: string;
  domain: string;
  niche: string;
  target_region: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  keywords: { count: number }[] | null;
  blogs: { count: number }[] | null;
  calendar_entries: { count: number }[] | null;
  project_competitors: { count: number }[] | null;
};

function relCount(rel: { count: number }[] | null | undefined): number {
  return rel?.[0]?.count ?? 0;
}

function avgHealth(
  audits: { project_id: string; health_score: number }[] | null,
  projectId: string
): { avg: number | null; count: number } {
  const rows = (audits ?? []).filter((a) => a.project_id === projectId);
  if (!rows.length) return { avg: null, count: 0 };
  const sum = rows.reduce((acc, r) => acc + (r.health_score ?? 0), 0);
  return { avg: Math.round(sum / rows.length), count: rows.length };
}

export async function listAdminProjects(
  params: AdminListParams
): Promise<
  { success: true; data: AdminProjectsListResult } | { success: false; error: string }
> {
  try {
    const db = getSupabaseAdmin();
    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let query = db
      .from("projects")
      .select(
        `id, name, domain, niche, target_region, user_id, created_at, updated_at,
         keywords(count),
         blogs(count),
         calendar_entries(count),
         project_competitors(count)`,
        { count: "exact" }
      );

    if (params.userId) {
      query = query.eq("user_id", params.userId);
    }

    if (params.search) {
      const escaped = params.search.replace(/[%_,]/g, "");
      const q = `%${escaped}%`;
      query = query.or(
        `name.ilike.${q},domain.ilike.${q},niche.ilike.${q},company.ilike.${q}`
      );
    }

    const sortCol =
      params.sort === "name"
        ? "name"
        : params.sort === "domain"
          ? "domain"
          : params.sort === "created"
            ? "created_at"
            : "updated_at";

    query = query.order(sortCol, { ascending: params.sortDir === "asc" });
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const projectRows = (data ?? []) as ProjectRow[];
    const projectIds = projectRows.map((p) => p.id);

    let audits: { project_id: string; health_score: number }[] = [];
    if (projectIds.length) {
      const { data: auditRows } = await db
        .from("blog_audits")
        .select("project_id, health_score")
        .in("project_id", projectIds);
      audits = auditRows ?? [];
    }

    const items: AdminProjectRow[] = projectRows.map((p) => {
      const health = avgHealth(audits, p.id);
      return {
        id: p.id,
        name: p.name,
        domain: p.domain,
        niche: p.niche,
        targetRegion: p.target_region,
        userId: p.user_id,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        keywordCount: relCount(p.keywords),
        competitorCount: relCount(p.project_competitors),
        contentCount: relCount(p.blogs),
        calendarCount: relCount(p.calendar_entries),
        avgHealthScore: health.avg,
        auditsRun: health.count,
      };
    });

    return {
      success: true,
      data: {
        items,
        total: count ?? items.length,
        page: params.page,
        pageSize: params.pageSize,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list projects";
    console.error("[admin-projects]", message);
    return { success: false, error: message };
  }
}
