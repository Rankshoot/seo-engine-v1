import { currentUser } from "@clerk/nextjs/server";
import { listContentStudioHistory } from "@/app/actions/content-actions";
import type { ContentType } from "@/lib/types";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

const ALLOWED_TYPES: ContentType[] = ["blog", "ebook", "whitepaper", "linkedin"];
const ALLOWED_STATUSES = new Set(["generated", "approved", "published"]);

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const user = await currentUser();
  if (!user) {
    return apiJson({ success: false, error: "Not authenticated", data: [] }, { status: 401 });
  }

  const { projectId } = await params;
  const { searchParams } = new URL(req.url);

  const typesParam = searchParams.get("types");
  const types = typesParam
    ? typesParam
        .split(",")
        .map(t => t.trim().toLowerCase())
        .filter((t): t is ContentType => (ALLOWED_TYPES as string[]).includes(t))
    : undefined;

  const statusParam = searchParams.get("statuses");
  const statuses = statusParam
    ? statusParam
        .split(",")
        .map(s => s.trim().toLowerCase())
        .filter(s => ALLOWED_STATUSES.has(s))
    : undefined;

  const limitParam = searchParams.get("limit");
  const limit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10), 1), 100) : 20;

  const offsetParam = searchParams.get("offset");
  const offset = offsetParam ? Math.max(parseInt(offsetParam, 10), 0) : 0;

  const search = searchParams.get("search")?.trim() || undefined;

  const sortParam = searchParams.get("sort");
  const sort = (sortParam || "updated") as "updated" | "created" | "words" | "title";

  const result = await listContentStudioHistory(projectId, {
    types,
    statuses,
    limit,
    offset,
    search,
    sort,
  });
  return apiJson(result, { status: result.success ? 200 : 500 });
}
