import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { QuotaService } from "@/services/quota";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated. Please sign in." }, { status: 401 });
  }

  try {
    const status = await QuotaService.getUserQuotaStatus(user.id);
    
    const db = getSupabaseAdmin();
    const { data: projects, error: projErr } = await db
      .from("projects")
      .select("id, name, user_id")
      .eq("user_id", user.id);
      
    // Get charcodes of user.id
    const getCharCodes = (str: string) => {
      const codes = [];
      for (let i = 0; i < str.length; i++) {
        codes.push(`${str[i]}:${str.charCodeAt(i)}`);
      }
      return codes.join(", ");
    };

    return NextResponse.json({
      clerkUser: {
        id: user.id,
        idCharCodes: getCharCodes(user.id),
        email: user.emailAddresses[0]?.emailAddress,
      },
      quotaStatus: status,
      projectsInDb: projects,
      projErr: projErr ? projErr.message : null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
