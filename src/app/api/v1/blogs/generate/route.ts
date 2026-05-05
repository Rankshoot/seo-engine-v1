import { currentUser } from "@clerk/nextjs/server";
import { generateBlog } from "@/app/actions/blog-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  try {
    const body = (await req.json()) as { entryId: string; wordCount?: number; writerNotes?: string };
    if (!body.entryId) return apiJson({ success: false, error: "Expected { entryId, wordCount?, writerNotes? }" }, { status: 400 });
    const result = await generateBlog(body.entryId, body.wordCount ?? 2500, body.writerNotes);
    return apiJson(result, { status: result.success ? 200 : 400 });
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
}
