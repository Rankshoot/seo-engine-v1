import { currentUser } from "@clerk/nextjs/server";
import { generateBusinessBrief, getBusinessBrief } from "@/app/actions/brief-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated", brief: null }, { status: 401 });
  const { projectId } = await params;
  const result = await getBusinessBrief(projectId);
  return apiJson(result, { status: result.success ? 200 : 500 });
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  let force = false;
  try {
    const body = (await req.json()) as { force?: boolean } | null;
    force = Boolean(body?.force);
  } catch {
    /* empty body ok */
  }
  const result = await generateBusinessBrief(projectId, { force });
  return apiJson(result, { status: result.success ? 200 : 400 });
}
