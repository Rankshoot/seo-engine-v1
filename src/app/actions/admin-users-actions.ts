"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/require-admin";
import { QuotaService } from "@/services/quota";
import type { AdminListParams } from "@/lib/admin/parse-list-params";
import type { AdminUserRow, AdminUsersListResult, ApprovalStatus } from "@/types/admin-users";

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

interface UserAgg {
  userId: string;
  projectCount: number;
  projectIds: string[];
  lastActiveAt: string | null;
  firstSeenAt: string | null;
}

async function enrichClerkProfile(
  userId: string
): Promise<{ email: string | null; displayName: string | null }> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email =
      user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null;
    const displayName =
      [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.username ||
      null;
    return { email, displayName };
  } catch {
    return { email: null, displayName: null };
  }
}

export async function listAdminUsers(
  params: AdminListParams
): Promise<
  { success: true; data: AdminUsersListResult } | { success: false; error: string }
> {
  try {
    const db = getSupabaseAdmin();
    const since30d = daysAgoIso(30);

    const [{ data: projects, error: projErr }, { data: approvalUsers }] = await Promise.all([
      db
        .from("projects")
        .select("id, user_id, created_at, updated_at")
        .returns<{ id: string; user_id: string; created_at: string; updated_at: string }[]>(),
      db
        .from("user_approvals")
        .select("clerk_user_id, requested_at")
        .returns<{ clerk_user_id: string; requested_at: string }[]>(),
    ]);

    if (projErr) throw new Error(projErr.message);

    const byUser = new Map<string, UserAgg>();

    // Seed map from user_approvals so users with no projects still appear
    for (const a of approvalUsers ?? []) {
      if (!a.clerk_user_id) continue;
      if (!byUser.has(a.clerk_user_id)) {
        byUser.set(a.clerk_user_id, {
          userId: a.clerk_user_id,
          projectCount: 0,
          projectIds: [],
          lastActiveAt: null,
          firstSeenAt: a.requested_at ?? null,
        });
      }
    }

    for (const p of projects ?? []) {
      if (!p.user_id) continue;
      const cur = byUser.get(p.user_id) ?? {
        userId: p.user_id,
        projectCount: 0,
        projectIds: [],
        lastActiveAt: null,
        firstSeenAt: null,
      };
      cur.projectCount += 1;
      cur.projectIds.push(p.id);
      const active = p.updated_at ?? p.created_at;
      const created = p.created_at;
      if (active && (!cur.lastActiveAt || active > cur.lastActiveAt)) {
        cur.lastActiveAt = active;
      }
      if (created && (!cur.firstSeenAt || created < cur.firstSeenAt)) {
        cur.firstSeenAt = created;
      }
      byUser.set(p.user_id, cur);
    }

    let rows: UserAgg[] = Array.from(byUser.values());

    if (params.search) {
      const q = params.search;
      const filtered: UserAgg[] = [];
      for (const row of rows) {
        if (row.userId.toLowerCase().includes(q)) {
          filtered.push(row);
          continue;
        }
        const profile = await enrichClerkProfile(row.userId);
        if (
          profile.email?.toLowerCase().includes(q) ||
          profile.displayName?.toLowerCase().includes(q)
        ) {
          filtered.push(row);
        }
      }
      rows = filtered;
    }

    const sortKey = params.sort;
    const dir = params.sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const cmp = (x: number | string | null, y: number | string | null) => {
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        if (typeof x === "number" && typeof y === "number") return x - y;
        return String(x).localeCompare(String(y));
      };
      switch (sortKey) {
        case "projectCount":
          return cmp(a.projectCount, b.projectCount) * dir;
        case "firstSeen":
          return cmp(a.firstSeenAt, b.firstSeenAt) * dir;
        case "userId":
          return cmp(a.userId, b.userId) * dir;
        case "lastActive":
        default:
          return cmp(a.lastActiveAt, b.lastActiveAt) * dir;
      }
    });

    const total = rows.length;
    const start = (params.page - 1) * params.pageSize;
    const pageRows = rows.slice(start, start + params.pageSize);

    const allPageProjectIds = pageRows.flatMap((r) => r.projectIds);
    const pageUserIds = pageRows.map((r) => r.userId);

    const [keywordsRes, blogsRes, aiLogsRes, apiLogsRes, approvalsRes] = await Promise.all([
      allPageProjectIds.length
        ? db.from("keywords").select("project_id").in("project_id", allPageProjectIds)
        : Promise.resolve({ data: [] as { project_id: string }[] }),
      allPageProjectIds.length
        ? db.from("blogs").select("project_id").in("project_id", allPageProjectIds)
        : Promise.resolve({ data: [] as { project_id: string }[] }),
      pageRows.length
        ? db
            .from("ai_usage_logs")
            .select("user_id, estimated_cost_usd")
            .gte("created_at", since30d)
            .in(
              "user_id",
              pageRows.map((r) => r.userId)
            )
        : Promise.resolve({ data: [] as { user_id: string; estimated_cost_usd: number | null }[] }),
      pageRows.length
        ? db
            .from("api_usage_logs")
            .select("user_id, estimated_cost_usd")
            .gte("created_at", since30d)
            .in(
              "user_id",
              pageRows.map((r) => r.userId)
            )
        : Promise.resolve({ data: [] as { user_id: string; estimated_cost_usd: number | null }[] }),
      pageUserIds.length
        ? db
            .from("user_approvals")
            .select("clerk_user_id, status")
            .in("clerk_user_id", pageUserIds)
        : Promise.resolve({ data: [] as { clerk_user_id: string; status: string }[] }),
    ]);

    const kwByProject = new Map<string, number>();
    for (const k of keywordsRes.data ?? []) {
      kwByProject.set(k.project_id, (kwByProject.get(k.project_id) ?? 0) + 1);
    }
    const blogsByProject = new Map<string, number>();
    for (const b of blogsRes.data ?? []) {
      blogsByProject.set(b.project_id, (blogsByProject.get(b.project_id) ?? 0) + 1);
    }

    const aiByUser = new Map<string, { count: number; cost: number }>();
    for (const row of aiLogsRes.data ?? []) {
      if (!row.user_id) continue;
      const cur = aiByUser.get(row.user_id) ?? { count: 0, cost: 0 };
      cur.count += 1;
      cur.cost += Number(row.estimated_cost_usd ?? 0) || 0;
      aiByUser.set(row.user_id, cur);
    }
    const apiByUser = new Map<string, number>();
    for (const row of apiLogsRes.data ?? []) {
      if (!row.user_id) continue;
      apiByUser.set(
        row.user_id,
        (apiByUser.get(row.user_id) ?? 0) + (Number(row.estimated_cost_usd ?? 0) || 0)
      );
    }

    const approvalByUser = new Map<string, ApprovalStatus>();
    for (const row of approvalsRes.data ?? []) {
      if (!row.clerk_user_id) continue;
      approvalByUser.set(row.clerk_user_id, row.status as ApprovalStatus);
    }

    const items: AdminUserRow[] = await Promise.all(
      pageRows.map(async (row) => {
        const profile = await enrichClerkProfile(row.userId);
        let keywordCount = 0;
        let contentCount = 0;
        for (const pid of row.projectIds) {
          keywordCount += kwByProject.get(pid) ?? 0;
          contentCount += blogsByProject.get(pid) ?? 0;
        }
        const ai = aiByUser.get(row.userId);
        return {
          userId: row.userId,
          email: profile.email,
          displayName: profile.displayName,
          projectCount: row.projectCount,
          keywordCount,
          contentCount,
          aiRequests30d: ai?.count ?? 0,
          apiCostUsd30d: apiByUser.get(row.userId) ?? 0,
          aiCostUsd30d: ai?.cost ?? 0,
          lastActiveAt: row.lastActiveAt,
          firstSeenAt: row.firstSeenAt,
          approvalStatus: approvalByUser.get(row.userId) ?? "approved",
        };
      })
    );

    return {
      success: true,
      data: {
        items,
        total,
        page: params.page,
        pageSize: params.pageSize,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list users";
    console.error("[admin-users]", message);
    return { success: false, error: message };
  }
}

/**
 * Admin action to fetch full quota limits, overrides and usage status for a user.
 */
export async function getAdminUserQuotaStatus(userId: string) {
  const adminCheck = await requireAdmin({ minRole: "support" });
  if (!adminCheck.ok) {
    throw new Error("Unauthorized: Admin role required.");
  }

  // Ensure record exists
  await QuotaService.ensureUserRecords(userId);

  return QuotaService.getUserQuotaStatus(userId);
}

/**
 * Admin action to update user-specific quotas, base plan, and overrides.
 */
export async function updateAdminUserQuota(
  userId: string,
  updates: {
    planId: string;
    subscriptionStatus: string;
    override_projects: number | null;
    override_keywords_fetched: number | null;
    override_keywords_explored: number | null;
    override_standard_content: number | null;
    override_premium_content: number | null;
    override_ai_credits: number | null;
  }
) {
  const adminCheck = await requireAdmin({ minRole: "admin" });
  if (!adminCheck.ok) {
    throw new Error("Unauthorized: Admin role required.");
  }

  const db = getSupabaseAdmin();

  // Update user profile record plan and status
  const { error: userErr } = await db
    .from("users")
    .update({
      plan_id: updates.planId,
      subscription_status: updates.subscriptionStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (userErr) {
    throw new Error(`Failed to update user profile plan: ${userErr.message}`);
  }

  // Ensure quota record is present first
  await QuotaService.ensureUserRecords(userId);

  // Fetch target plan limits to sync base counters
  const { data: plan, error: planErr } = await db
    .from("subscription_plans")
    .select("*")
    .eq("id", updates.planId)
    .single();

  if (planErr || !plan) {
    throw new Error(`Failed to fetch limits for plan ${updates.planId}`);
  }

  // Sync quotas with overrides
  const { error: quotaErr } = await db
    .from("user_quotas")
    .update({
      limit_projects: plan.limit_projects,
      limit_keywords_fetched: plan.limit_keywords_fetched,
      limit_keywords_explored: plan.limit_keywords_explored,
      limit_standard_content: plan.limit_standard_content,
      limit_premium_content: plan.limit_premium_content,
      limit_ai_credits: plan.limit_ai_credits,

      override_projects: updates.override_projects,
      override_keywords_fetched: updates.override_keywords_fetched,
      override_keywords_explored: updates.override_keywords_explored,
      override_standard_content: updates.override_standard_content,
      override_premium_content: updates.override_premium_content,
      override_ai_credits: updates.override_ai_credits,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (quotaErr) {
    throw new Error(`Failed to update overrides in database: ${quotaErr.message}`);
  }

  return { success: true };
}

/**
 * Admin action to fetch and aggregate precise costing and usage data per user.
 */
export async function getAdminUserCostAndUsage(
  userId: string,
  startDateStr: string,
  endDateStr: string
) {
  const adminCheck = await requireAdmin({ minRole: "support" });
  if (!adminCheck.ok) {
    throw new Error("Unauthorized: Admin role required.");
  }

  const db = getSupabaseAdmin();

  // Parse start and end dates
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  end.setHours(23, 59, 59, 999); // Cover the full last day

  const [aiLogsRes, apiLogsRes] = await Promise.all([
    db
      .from("ai_usage_logs")
      .select("estimated_cost_usd, created_at, status")
      .eq("user_id", userId)
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .order("created_at", { ascending: true }),
    db
      .from("api_usage_logs")
      .select("estimated_cost_usd, created_at, status")
      .eq("user_id", userId)
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .order("created_at", { ascending: true }),
  ]);

  if (aiLogsRes.error) throw new Error(`AI logs error: ${aiLogsRes.error.message}`);
  if (apiLogsRes.error) throw new Error(`API logs error: ${apiLogsRes.error.message}`);

  const aiLogs = aiLogsRes.data || [];
  const apiLogs = apiLogsRes.data || [];

  let totalAiCost = 0;
  for (const log of aiLogs) {
    totalAiCost += Number(log.estimated_cost_usd) || 0;
  }

  let totalApiCost = 0;
  for (const log of apiLogs) {
    totalApiCost += Number(log.estimated_cost_usd) || 0;
  }

  // Aggregate daily mapping for charts
  const dailyMap = new Map<
    string,
    { date: string; aiCost: number; apiCost: number; aiCalls: number; apiCalls: number }
  >();

  // Pre-populate every single date in the range to avoid empty gaps in rendering
  const tempDate = new Date(start);
  while (tempDate <= end) {
    const dateStr = tempDate.toISOString().slice(0, 10);
    dailyMap.set(dateStr, {
      date: dateStr,
      aiCost: 0,
      apiCost: 0,
      aiCalls: 0,
      apiCalls: 0,
    });
    tempDate.setDate(tempDate.getDate() + 1);
  }

  // Populate AI logs stats
  for (const log of aiLogs) {
    const dateStr = log.created_at.slice(0, 10);
    let cur = dailyMap.get(dateStr);
    if (!cur) {
      cur = { date: dateStr, aiCost: 0, apiCost: 0, aiCalls: 0, apiCalls: 0 };
      dailyMap.set(dateStr, cur);
    }
    cur.aiCost += Number(log.estimated_cost_usd) || 0;
    cur.aiCalls += 1;
  }

  // Populate API logs stats
  for (const log of apiLogs) {
    const dateStr = log.created_at.slice(0, 10);
    let cur = dailyMap.get(dateStr);
    if (!cur) {
      cur = { date: dateStr, aiCost: 0, apiCost: 0, aiCalls: 0, apiCalls: 0 };
      dailyMap.set(dateStr, cur);
    }
    cur.apiCost += Number(log.estimated_cost_usd) || 0;
    cur.apiCalls += 1;
  }

  const chartData = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalAiCost,
    totalApiCost,
    totalCost: totalAiCost + totalApiCost,
    aiCount: aiLogs.length,
    apiCount: apiLogs.length,
    chartData,
  };
}
