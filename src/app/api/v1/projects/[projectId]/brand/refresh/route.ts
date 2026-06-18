import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { discoverBrand } from "@/services/brandIntelligence";

export const maxDuration = 120;

/** POST /api/v1/projects/[projectId]/brand/refresh — re-run brand extraction */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const user = await currentUser();
  if (!user) return new Response("Not authenticated", { status: 401 });

  const { projectId } = await params;

  const { data: project } = await supabaseAdmin
    .from("projects")
    .select("id, domain, company, niche, description, brand_ref_landing_page_url")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!project) return new Response("Project not found", { status: 404 });

  const profile = await discoverBrand({
    projectId,
    domain: project.domain,
    company: project.company,
    niche: project.niche,
    description: project.description ?? "",
    refLandingPageUrl: project.brand_ref_landing_page_url,
  });

  if (!profile) {
    return new Response(
      JSON.stringify({ success: false, error: "Brand extraction failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ success: true, data: profile }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
