import { currentUser } from "@clerk/nextjs/server";
import { addBlogToArticlesLibrary } from "@/app/actions/blog-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

/** Save the open draft to the project Articles list (same auth path as GET /blogs/:id). */
export async function POST(_req: Request, { params }: { params: Promise<{ blogId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated", alreadySaved: false }, { status: 401 });
  const { blogId } = await params;
  const result = await addBlogToArticlesLibrary(blogId);
  return apiJson(result, { status: result.success ? 200 : 400 });
}
