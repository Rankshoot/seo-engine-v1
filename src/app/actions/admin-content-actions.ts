"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { escapeIlikePattern, applyAdminDateRange } from "@/lib/admin/apply-log-list-filters";
import type { AdminListParams } from "@/lib/admin/parse-list-params";
import type { AdminContentRow, AdminContentListResult } from "@/types/admin-content";

type BlogDbRow = {
  id: string;
  project_id: string;
  title: string;
  content_type: string;
  status: string;
  word_count: number | null;
  target_keyword: string | null;
  article_type: string | null;
  slug: string | null;
  source_url: string | null;
  deep_analysis_score: number | null;
  created_at: string;
  updated_at: string;
  projects:
    | { name: string; domain: string; user_id: string }
    | { name: string; domain: string; user_id: string }[]
    | null;
};

function projectFromRow(
  projects: BlogDbRow["projects"]
): { name: string; domain: string; user_id: string } | null {
  if (!projects) return null;
  return Array.isArray(projects) ? (projects[0] ?? null) : projects;
}

function mapRow(row: BlogDbRow): AdminContentRow {
  const project = projectFromRow(row.projects);
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: project?.name ?? "—",
    projectDomain: project?.domain ?? "",
    userId: project?.user_id ?? null,
    title: row.title,
    contentType: row.content_type,
    status: row.status,
    wordCount: row.word_count ?? 0,
    targetKeyword: row.target_keyword ?? "",
    articleType: row.article_type ?? "",
    slug: row.slug ?? "",
    sourceUrl: row.source_url ?? "",
    deepAnalysisScore: row.deep_analysis_score,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAdminContent(
  params: AdminListParams
): Promise<
  { success: true; data: AdminContentListResult } | { success: false; error: string }
> {
  try {
    const db = getSupabaseAdmin();
    let projectIdsIn: string[] | undefined;

    if (params.userId) {
      const { data: userProjects, error: upErr } = await db
        .from("projects")
        .select("id")
        .eq("user_id", params.userId);
      if (upErr) throw new Error(upErr.message);
      projectIdsIn = (userProjects ?? []).map((p) => p.id);
      if (!projectIdsIn.length) {
        return {
          success: true,
          data: {
            items: [],
            total: 0,
            page: params.page,
            pageSize: params.pageSize,
          },
        };
      }
    }

    const from = (params.page - 1) * params.pageSize;
    const to = from + params.pageSize - 1;

    let query = db
      .from("blogs")
      .select(
        `id, project_id, title, content_type, status, word_count, target_keyword,
         article_type, slug, source_url, deep_analysis_score, created_at, updated_at,
         projects(name, domain, user_id)`,
        { count: "exact" }
      );

    if (params.projectId) query = query.eq("project_id", params.projectId);
    else if (projectIdsIn?.length) query = query.in("project_id", projectIdsIn);

    if (params.provider) query = query.eq("content_type", params.provider);
    if (params.status) query = query.eq("status", params.status);

    query = applyAdminDateRange(query, params);

    if (params.search) {
      const q = `%${escapeIlikePattern(params.search)}%`;
      query = query.or(
        `title.ilike.${q},target_keyword.ilike.${q},slug.ilike.${q},article_type.ilike.${q}`
      );
    }

    const sortCol =
      params.sort === "title"
        ? "title"
        : params.sort === "words"
          ? "word_count"
          : params.sort === "updated"
            ? "updated_at"
            : "created_at";

    query = query.order(sortCol, {
      ascending: params.sortDir === "asc",
      nullsFirst: false,
    });
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);

    const items = ((data ?? []) as BlogDbRow[]).map(mapRow);

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
    const message = e instanceof Error ? e.message : "Failed to list content";
    console.error("[admin-content]", message);
    return { success: false, error: message };
  }
}
