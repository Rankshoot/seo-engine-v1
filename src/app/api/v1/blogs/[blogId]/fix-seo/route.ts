import { currentUser } from "@clerk/nextjs/server";
import { fixBlogSeoIssue } from "@/app/actions/blog-actions";
import type { BlogSeoIssueKey } from "@/lib/types";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ blogId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated", data: null }, { status: 401 });
  const { blogId } = await params;
  try {
    const body = (await req.json()) as { issueKey: BlogSeoIssueKey };
    if (!body.issueKey) return apiJson({ success: false, error: "Expected { issueKey }", data: null }, { status: 400 });
    const result = await fixBlogSeoIssue(blogId, body.issueKey);
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body", data: null }, { status: 400 });
  }
}
