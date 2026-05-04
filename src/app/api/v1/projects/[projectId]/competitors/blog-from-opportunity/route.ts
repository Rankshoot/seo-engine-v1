import { currentUser } from "@clerk/nextjs/server";
import { generateBlogFromOpportunity } from "@/app/actions/competitor-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  try {
    const body = (await req.json()) as { keyword: string };
    if (!body.keyword?.trim()) return apiJson({ success: false, error: "Expected { keyword }" }, { status: 400 });
    const result = await generateBlogFromOpportunity(projectId, body.keyword.trim());
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
}
