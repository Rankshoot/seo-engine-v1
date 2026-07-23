import { currentUser } from "@clerk/nextjs/server";
import { generateTrendingKeywordsAction } from "@/app/actions/keyword-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
// Search-grounded generation (real web search + synthesis) runs well past the
// old 60s cap — the route was killing requests before the internal 90s AI
// timeout could even fire cleanly. Matches other single-call AI routes
// (blogs/enhance, keywords/domain) with margin above the internal timeout.
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  try {
    const body = (await req.json().catch(() => ({}))) as { userPrompt?: string };
    const result = await generateTrendingKeywordsAction(projectId, { userPrompt: body.userPrompt });
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body (expected { userPrompt? })" }, { status: 400 });
  }
}
