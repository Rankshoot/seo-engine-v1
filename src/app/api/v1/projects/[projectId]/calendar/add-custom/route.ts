import { currentUser } from "@clerk/nextjs/server";
import { addCustomKeywordToCalendar } from "@/server/calendar/add-custom-keyword";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  const { projectId } = await params;

  let body: {
    keyword?: string;
    title?: string;
    articleType?: string;
    writerNotes?: string;
    targetDate?: string;
  };

  try {
    const raw = await req.text();
    if (!raw?.trim()) return apiJson({ success: false, error: "Request body required" }, { status: 400 });
    body = JSON.parse(raw);
  } catch {
    return apiJson({ success: false, error: "Malformed JSON body" }, { status: 400 });
  }

  if (!body.keyword?.trim()) {
    return apiJson({ success: false, error: "keyword is required" }, { status: 400 });
  }

  try {
    const result = await addCustomKeywordToCalendar({
      projectId,
      keyword: body.keyword.trim(),
      title: body.title,
      articleType: body.articleType,
      writerNotes: body.writerNotes,
      targetDate: body.targetDate,
    });
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch (e) {
    console.error("[calendar/add-custom]", e);
    return apiJson(
      { success: false, error: e instanceof Error ? e.message : "Failed to add keyword" },
      { status: 500 }
    );
  }
}
