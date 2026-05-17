"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import type {
  AdminOverviewData,
  AdminOverviewMetrics,
  AdminProviderUsageSummary,
  AdminRecentContent,
  AdminRecentError,
  AdminRecentProject,
  AdminRecentUser,
} from "@/types/admin-overview";

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function sumCost(rows: { estimated_cost_usd: number | string | null }[] | null): number {
  if (!rows?.length) return 0;
  return rows.reduce((acc, r) => {
    const n = Number(r.estimated_cost_usd ?? 0);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function buildProviderUsage(
  rows: {
    provider: string;
    cache_hit: boolean;
    status: string;
    estimated_cost_usd: number | string | null;
  }[] | null
): AdminProviderUsageSummary[] {
  const byProvider = new Map<
    string,
    { fresh: number; cacheHits: number; cost: number }
  >();

  for (const row of rows ?? []) {
    const p = row.provider || "unknown";
    const bucket = byProvider.get(p) ?? { fresh: 0, cacheHits: 0, cost: 0 };
    const isCache = row.cache_hit || row.status === "cached";
    if (isCache) bucket.cacheHits += 1;
    else bucket.fresh += 1;
    bucket.cost += Number(row.estimated_cost_usd ?? 0) || 0;
    byProvider.set(p, bucket);
  }

  return Array.from(byProvider.entries())
    .map(([provider, v]) => {
      const totalCalls = v.fresh + v.cacheHits;
      const cacheHitRatePct =
        totalCalls > 0 ? Math.round((v.cacheHits / totalCalls) * 100) : 0;
      return {
        provider,
        freshCalls: v.fresh,
        cacheHits: v.cacheHits,
        totalCalls,
        cacheHitRatePct,
        estimatedCostUsd: Math.round(v.cost * 1_000_000) / 1_000_000,
      };
    })
    .sort((a, b) => b.totalCalls - a.totalCalls);
}

async function countTable(table: string): Promise<number> {
  const db = getSupabaseAdmin();
  const { count, error } = await db
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) {
    console.warn(`[admin-overview] count ${table}:`, error.message);
    return 0;
  }
  return count ?? 0;
}

export async function getAdminOverview(): Promise<
  { success: true; data: AdminOverviewData } | { success: false; error: string }
> {
  try {
    const db = getSupabaseAdmin();
    const since30d = daysAgoIso(30);

    const [
      projectsRes,
      keywordsCount,
      contentCount,
      apiLogsRes,
      aiLogsRes,
      aiCountRes,
      openErrorsCount,
      errors30dCount,
      recentProjectsRes,
      recentBlogsRes,
      recentErrorsRes,
      allProjectsRes,
    ] = await Promise.all([
      db.from("projects").select("user_id, created_at, updated_at"),
      countTable("keywords"),
      countTable("blogs"),
      db
        .from("api_usage_logs")
        .select("provider, cache_hit, status, estimated_cost_usd, user_id, created_at")
        .gte("created_at", since30d),
      db
        .from("ai_usage_logs")
        .select("estimated_cost_usd, user_id, created_at")
        .gte("created_at", since30d),
      db
        .from("ai_usage_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since30d),
      db
        .from("system_error_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "open"),
      db
        .from("system_error_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since30d),
      db
        .from("projects")
        .select("id, name, domain, user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
      db
        .from("blogs")
        .select(
          "id, title, content_type, project_id, created_at, projects(name, user_id)"
        )
        .order("created_at", { ascending: false })
        .limit(8),
      db
        .from("system_error_logs")
        .select("id, feature, provider, severity, error_message, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
      db.from("projects").select("user_id, created_at, updated_at"),
    ]);

    const projects = projectsRes.data ?? [];
    const totalUsers = new Set(projects.map((p) => p.user_id).filter(Boolean)).size;
    const totalProjects = projects.length;

    const activeUserIds = new Set<string>();
    for (const p of projects) {
      if (!p.user_id) continue;
      const touched =
        (p.updated_at && p.updated_at >= since30d) ||
        (p.created_at && p.created_at >= since30d);
      if (touched) activeUserIds.add(p.user_id);
    }
    for (const row of apiLogsRes.data ?? []) {
      if (row.user_id) activeUserIds.add(row.user_id);
    }
    for (const row of aiLogsRes.data ?? []) {
      if (row.user_id) activeUserIds.add(row.user_id);
    }

    const apiCostUsd30d = sumCost(apiLogsRes.data);
    const aiCostUsd30d = sumCost(aiLogsRes.data);

    const metrics: AdminOverviewMetrics = {
      totalUsers,
      activeUsers30d: activeUserIds.size,
      totalProjects,
      totalKeywords: keywordsCount,
      totalContent: contentCount,
      aiRequests30d: aiCountRes.count ?? 0,
      apiCostUsd30d,
      aiCostUsd30d,
      totalCostUsd30d: apiCostUsd30d + aiCostUsd30d,
      openErrors: openErrorsCount.count ?? 0,
      errors30d: errors30dCount.count ?? 0,
    };

    const providerUsage = buildProviderUsage(apiLogsRes.data);

    const recentProjects: AdminRecentProject[] = (recentProjectsRes.data ?? []).map(
      (p) => ({
        id: p.id,
        name: p.name,
        domain: p.domain,
        userId: p.user_id,
        createdAt: p.created_at,
      })
    );

    const recentContent: AdminRecentContent[] = (recentBlogsRes.data ?? []).map((b) => {
      const proj = b.projects as { name?: string; user_id?: string } | null;
      return {
        id: b.id,
        title: b.title,
        contentType: b.content_type,
        projectId: b.project_id,
        projectName: proj?.name ?? "—",
        userId: proj?.user_id ?? "",
        createdAt: b.created_at,
      };
    });

    const recentErrors: AdminRecentError[] = (recentErrorsRes.data ?? []).map((e) => ({
      id: e.id,
      feature: e.feature,
      provider: e.provider,
      severity: e.severity,
      errorMessage: e.error_message,
      createdAt: e.created_at,
    }));

    const userAgg = new Map<
      string,
      { projectCount: number; lastActiveAt: string | null }
    >();
    for (const p of allProjectsRes.data ?? []) {
      if (!p.user_id) continue;
      const cur = userAgg.get(p.user_id) ?? {
        projectCount: 0,
        lastActiveAt: null,
      };
      cur.projectCount += 1;
      const candidate = p.updated_at ?? p.created_at;
      if (
        candidate &&
        (!cur.lastActiveAt || candidate > cur.lastActiveAt)
      ) {
        cur.lastActiveAt = candidate;
      }
      userAgg.set(p.user_id, cur);
    }

    const recentUsers: AdminRecentUser[] = Array.from(userAgg.entries())
      .map(([userId, v]) => ({
        userId,
        projectCount: v.projectCount,
        lastActiveAt: v.lastActiveAt,
      }))
      .sort((a, b) => {
        const ta = a.lastActiveAt ?? "";
        const tb = b.lastActiveAt ?? "";
        return tb.localeCompare(ta);
      })
      .slice(0, 8);

    const hasUsageLogs =
      (apiLogsRes.data?.length ?? 0) > 0 || (aiLogsRes.data?.length ?? 0) > 0;

    const data: AdminOverviewData = {
      metrics,
      providerUsage,
      recentProjects,
      recentContent,
      recentErrors,
      recentUsers,
      instrumentationNote: hasUsageLogs
        ? null
        : "Usage logs are empty — metrics will populate after API and AI instrumentation runs in production.",
    };

    return { success: true, data };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load admin overview";
    console.error("[admin-overview]", message);
    return { success: false, error: message };
  }
}
