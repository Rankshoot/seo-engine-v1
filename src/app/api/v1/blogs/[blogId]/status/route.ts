import { currentUser } from "@clerk/nextjs/server";
import { updateBlogStatus } from "@/app/actions/blog-actions";
import type { BlogStatus } from "@/lib/types";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ blogId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { blogId } = await params;
  try {
    const body = (await req.json()) as { status: BlogStatus };
    if (!body.status) return apiJson({ success: false, error: "Expected { status }" }, { status: 400 });
    const result = await updateBlogStatus(blogId, body.status);
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
}
