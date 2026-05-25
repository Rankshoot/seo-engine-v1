"use server";

import { clerkClient } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { AdminListParams } from "@/lib/admin/parse-list-params";
import type { AdminUserRow, AdminUsersListResult } from "@/types/admin-users";

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

    const { data: projects, error: projErr } = await db
      .from("projects")
      .select("id, user_id, created_at, updated_at")
      .returns<
        { id: string; user_id: string; created_at: string; updated_at: string }[]
      >();

    if (projErr) throw new Error(projErr.message);

    const byUser = new Map<string, UserAgg>();
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

    const [keywordsRes, blogsRes, aiLogsRes, apiLogsRes] = await Promise.all([
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
