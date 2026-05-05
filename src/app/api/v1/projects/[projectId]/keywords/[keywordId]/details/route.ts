/**
 * GET /api/v1/projects/:projectId/keywords/:keywordId/details
 *
 * Same contract as the legacy `/api/projects/.../details` route — plain JSON
 * for DevTools (not server-action wire format).
 */

import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getOrFetchKeywordModalDetails } from "@/lib/keyword-modal";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";
export const maxDuration = 60;

interface RouteParams {
  params: Promise<{ projectId: string; keywordId: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { projectId, keywordId } = await params;

  if (!projectId || !keywordId) {
    return apiJson({ success: false, error: "projectId and keywordId are required" }, { status: 400 });
  }

  const user = await currentUser();
  if (!user) {
    return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const { data: project, error: pErr } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (pErr) {
    console.error("[v1/keywords/details] project lookup failed:", pErr.message);
    return apiJson({ success: false, error: pErr.message }, { status: 500 });
  }
  if (!project) {
    return apiJson({ success: false, error: "Project not found" }, { status: 404 });
  }

  const { data: keyword, error: kErr } = await supabaseAdmin
    .from("keywords")
    .select("id")
    .eq("id", keywordId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (kErr) {
    console.error("[v1/keywords/details] keyword lookup failed:", kErr.message);
    return apiJson({ success: false, error: kErr.message }, { status: 500 });
  }
  if (!keyword) {
    return apiJson({ success: false, error: "Keyword not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const forceRefresh =
    url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";

  try {
    const data = await getOrFetchKeywordModalDetails({
      projectId,
      keywordId,
      forceRefresh,
    });
    return apiJson({ success: true, data });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[v1/keywords/details] failed:", message);
    return apiJson({ success: false, error: message }, { status: 500 });
  }
}
