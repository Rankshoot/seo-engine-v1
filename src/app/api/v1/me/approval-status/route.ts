import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ status: "unauthenticated" }, { status: 401 });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("user_approvals")
    .select("status")
    .eq("clerk_user_id", userId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ status: "not_found" });
    }
    return NextResponse.json({ status: "db_error", message: error.message }, { status: 500 });
  }

  const status = data?.status ?? "pending";
  return NextResponse.json({ status });
}
