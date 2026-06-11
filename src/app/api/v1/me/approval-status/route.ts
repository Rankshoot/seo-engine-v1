import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ status: "unauthenticated" }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  const { data } = await db
    .from("user_approvals")
    .select("status")
    .eq("clerk_user_id", userId)
    .single();

  const status = (data as { status: string } | null)?.status ?? "pending";
  return NextResponse.json({ status });
}
