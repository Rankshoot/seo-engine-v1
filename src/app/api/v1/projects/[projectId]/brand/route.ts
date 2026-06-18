import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/** PATCH /api/v1/projects/[projectId]/brand — save user-edited brand profile */
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

  const allowed = [
    "brand_primary_color",
    "brand_secondary_color",
    "brand_accent_color",
    "brand_logo_url",
    "brand_visual_style",
    "brand_design_personality",
    "brand_image_style",
    "brand_palette_json",
    "brand_ref_landing_page_url",
    "brand_theme",
    "brand_screenshot_url",
    "brand_font_family",
    "brand_button_style",
    "brand_cta_link",
    "brand_landing_page_instruction",
  ] as const;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) patch[key] = body[key] ?? null;
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
