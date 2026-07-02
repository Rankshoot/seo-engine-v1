import { currentUser } from "@clerk/nextjs/server";
import { approveAISuggestionToCalendar } from "@/app/actions/calendar-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  try {
    const body = (await req.json()) as {
      keyword: string;
      keywordId?: string;
      source: string;
      page: string;
      volume?: number;
      kd?: number;
      cpc?: number;
      intent?: string;
      contentType?: "blog" | "ebook" | "whitepaper" | "linkedin";
    };
    if (!body.keyword?.trim() || !body.source || !body.page) {
      return apiJson(
        { success: false, error: "Expected { keyword, source, page, keywordId?, contentType? }" },
        { status: 400 }
      );
    }
    const result = await approveAISuggestionToCalendar({
      projectId,
      keyword: body.keyword,
      keywordId: body.keywordId,
      source: body.source,
      page: body.page,
      volume: body.volume,
      kd: body.kd,
      cpc: body.cpc,
      intent: body.intent,
      contentType: body.contentType,
    });
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
}
