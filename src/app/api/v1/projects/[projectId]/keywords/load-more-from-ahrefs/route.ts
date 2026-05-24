import { currentUser } from "@clerk/nextjs/server";
import { loadMoreFromAhrefsAction } from "@/app/actions/keyword-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await currentUser();
  if (!user) {
    return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const { projectId } = await params;

  try {
    const result = await loadMoreFromAhrefsAction(projectId);
    return apiJson(result, { status: result.success ? 200 : 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return apiJson({ success: false, error: message }, { status: 500 });
  }
}
