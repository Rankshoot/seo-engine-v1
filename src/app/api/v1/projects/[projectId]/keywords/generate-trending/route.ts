import { currentUser } from "@clerk/nextjs/server";
import { generateTrendingKeywordsAction } from "@/app/actions/keyword-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 60;

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
