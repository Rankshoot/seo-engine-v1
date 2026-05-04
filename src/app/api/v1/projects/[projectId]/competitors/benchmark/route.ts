import { currentUser } from "@clerk/nextjs/server";
import { getCompetitorBenchmark, runCompetitorBenchmark } from "@/app/actions/competitor-actions";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  const result = await getCompetitorBenchmark(projectId);
  return apiJson(result, { status: 200 });
}

export async function POST(_req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  const { projectId } = await params;
  const result = await runCompetitorBenchmark(projectId);
  return apiJson(result, { status: result.success ? 200 : 400 });
}
