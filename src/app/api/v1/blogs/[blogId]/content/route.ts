import { currentUser } from "@clerk/nextjs/server";
import { updateBlogContent } from "@/app/actions/blog-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function PATCH(req: Request, { params }: { params: Promise<{ blogId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated", data: null }, { status: 401 });
  const { blogId } = await params;
  try {
    const body = (await req.json()) as { content: string; title?: string; metaDescription?: string; contentData?: any };
    if (typeof body.content !== "string") {
      return apiJson({ success: false, error: "Expected { content, title?, metaDescription?, contentData? }", data: null }, { status: 400 });
    }
    const result = await updateBlogContent(blogId, body.content, {
      title: body.title,
      metaDescription: body.metaDescription,
      contentData: body.contentData,
    });
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body", data: null }, { status: 400 });
  }
}
