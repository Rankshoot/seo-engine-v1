import { currentUser } from "@clerk/nextjs/server";
import { getDomainKeywords } from "@/app/actions/keyword-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated", data: [] }, { status: 401 });
  const { projectId } = await params;
  const result = await getDomainKeywords(projectId);
  return apiJson(result, { status: result.success ? 200 : 400 });
}
