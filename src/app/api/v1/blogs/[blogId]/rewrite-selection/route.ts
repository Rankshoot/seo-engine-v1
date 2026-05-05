import { currentUser } from "@clerk/nextjs/server";
import { rewriteBlogEditorSelection } from "@/app/actions/blog-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ blogId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { blogId } = await params;
  try {
    const body = (await req.json()) as { selectedText?: string; instruction?: string };
    const selectedText = typeof body.selectedText === "string" ? body.selectedText : "";
    const instruction = typeof body.instruction === "string" ? body.instruction : "";
    const result = await rewriteBlogEditorSelection(blogId, selectedText, instruction);
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
}
