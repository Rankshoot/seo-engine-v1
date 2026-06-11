import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { assertAdminApi } from "@/lib/admin/assert-admin-api";
import { logAdminAudit } from "@/lib/admin/logging/admin-audit-logger";

function apiJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await assertAdminApi("admin");
  if (gate.response) return gate.response;

  const { userId } = await params;
  const body = await req.json() as { action?: string; notes?: string };
  const { action, notes } = body;

  if (!action || !["approve", "deny", "revoke"].includes(action)) {
    return apiJson({ success: false, error: "Invalid action. Must be approve, deny, or revoke." }, 400);
  }

  const statusMap: Record<string, string> = {
    approve: "approved",
    deny: "denied",
    revoke: "revoked",
  };
  const newStatus = statusMap[action];
  const approvedInClerk = action === "approve";

  const db = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { error } = await db.from("user_approvals").upsert(
    {
      clerk_user_id: userId,
      email: "",
      status: newStatus,
      reviewed_at: now,
      reviewed_by: gate.admin!.userId,
      review_notes: notes ?? "",
      updated_at: now,
    },
    { onConflict: "clerk_user_id" }
  );

  if (error) {
    console.error("[approval] upsert error", error);
    return apiJson({ success: false, error: "Failed to update approval record." }, 500);
  }

  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { approved: approvedInClerk },
  });

  void logAdminAudit({
    adminUserId: gate.admin!.userId,
    action: `user_approval_${action}`,
    targetType: "user",
    targetId: userId,
    metadata: { newStatus, notes: notes ?? "" },
  });

  return apiJson({ success: true });
}
