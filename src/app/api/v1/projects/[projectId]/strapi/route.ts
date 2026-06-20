import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/** PATCH /api/v1/projects/[projectId]/strapi — save Strapi CMS credentials */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await currentUser();
  if (!user) return new Response("Not authenticated", { status: 401 });

  const { projectId } = await params;

  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!project) return new Response("Project not found", { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("strapi_base_url" in body) {
    const url = body.strapi_base_url;
    patch.strapi_base_url = url && typeof url === "string" ? url.trim() || null : null;
  }

  if ("strapi_api_token" in body) {
    const token = body.strapi_api_token;
    patch.strapi_api_token = token && typeof token === "string" ? token.trim() || null : null;
  }

  const { error } = await supabaseAdmin
    .from("projects")
    .update(patch)
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
