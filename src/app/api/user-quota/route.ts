import { NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { QuotaService } from "@/services/quota";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const quota = await QuotaService.getClientQuotaStatus(user.id);
    return NextResponse.json({ success: true, data: quota }, {
      headers: {
        "Cache-Control": "private, max-age=30",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load quota";
    console.error("[api/user-quota]", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
