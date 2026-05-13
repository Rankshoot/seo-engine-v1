import { currentUser } from "@clerk/nextjs/server";
import { getEnhancedBlogForOriginal } from "@/app/actions/blog-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

/**
 * GET /api/v1/blogs/:blogId/enhanced
 *
 * Returns the latest "Enhanced" (article_type='Repair', source_url='blog://<blogId>')
 * version of this blog, or `data: null` when none exists. Powers the Before /
 * After toggle in the blog viewer when the user re-opens a previously
 * enhanced blog.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ blogId: string }> }) {
  const user = await currentUser();
  if (!user) {
    return apiJson({ success: false, error: "Not authenticated", data: null }, { status: 401 });
  }
  const { blogId } = await params;
  const result = await getEnhancedBlogForOriginal(blogId);
  return apiJson(result, { status: result.success ? 200 : 404 });
}
