import { currentUser } from "@clerk/nextjs/server";
import { getBlogById } from "@/app/actions/blog-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ blogId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated", data: null }, { status: 401 });
  const { blogId } = await params;
  const result = await getBlogById(blogId);
  return apiJson(result, { status: result.success ? 200 : 404 });
}
