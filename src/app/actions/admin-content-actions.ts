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

    const runQuery = async (selectStr: string) => {
      let q = db.from("blogs").select(selectStr, { count: "exact" });

      if (params.projectId) q = q.eq("project_id", params.projectId);
      else if (projectIdsIn?.length) q = q.in("project_id", projectIdsIn);

      if (params.provider) q = q.eq("content_type", params.provider);
      if (params.status) q = q.eq("status", params.status);

      q = applyAdminDateRange(q, params);

      if (params.search) {
        const qPattern = `%${escapeIlikePattern(params.search)}%`;
        q = q.or(
          `title.ilike.${qPattern},target_keyword.ilike.${qPattern},slug.ilike.${qPattern},article_type.ilike.${qPattern}`
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

      q = q.order(sortCol, {
        ascending: params.sortDir === "asc",
        nullsFirst: false,
      });
      q = q.range(from, to);
      return q;
    };

    let selectStr = `id, project_id, title, content_type, status, word_count, target_keyword,
         article_type, slug, source_url, deep_analysis_score, created_at, updated_at,
         projects(name, domain, user_id)`;

    let { data, error, count } = await runQuery(selectStr);

    if (error && (error.message.includes("deep_analysis_score") || error.code === "42703")) {
      console.warn("[admin-content] blogs.deep_analysis_score missing; retrying with fallback.");
      selectStr = `id, project_id, title, content_type, status, word_count, target_keyword,
         article_type, slug, source_url, created_at, updated_at,
         projects(name, domain, user_id)`;
      const fallbackResult = await runQuery(selectStr);
      data = fallbackResult.data;
      error = fallbackResult.error;
      count = fallbackResult.count;
    }

    if (error) throw new Error(error.message);

    const items = ((data ?? []) as unknown as BlogDbRow[]).map(mapRow);

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
