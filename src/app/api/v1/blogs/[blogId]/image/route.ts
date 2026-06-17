import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { generateContextualBlogImage, fetchBrandColors } from "@/services/openAiImages";
import { runWithUsageLogContext } from "@/lib/admin/logging/log-context";

export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ blogId: string }> }) {
  const user = await currentUser();
  if (!user) return new Response("Not authenticated", { status: 401 });

  const { blogId } = await params;

  let body: { imageAlt: string; contextBefore: string; contextAfter: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { data: blog, error: blogErr } = await supabaseAdmin
    .from("blogs")
    .select("*, projects(niche, target_audience, company, domain, brand_primary_color, brand_secondary_color, brand_accent_color, brand_palette_json, brand_visual_style, brand_design_personality, brand_image_style, brand_extracted_at)")
    .eq("id", blogId)
    .single();

  if (blogErr || !blog) {
    return new Response("Blog not found", { status: 404 });
  }

  const project = blog.projects as {
    niche: string;
    target_audience: string;
    company: string;
    domain: string;
    brand_primary_color?: string | null;
    brand_secondary_color?: string | null;
    brand_accent_color?: string | null;
    brand_palette_json?: string[] | null;
    brand_visual_style?: string | null;
    brand_design_personality?: string | null;
    brand_image_style?: string | null;
    brand_extracted_at?: string | null;
  };

  // Deduct AI credit before generating
  try {
    const { QuotaService } = await import("@/services/quota");
    await QuotaService.deductQuota(user.id, "ai_credits", 1);
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || "AI credits exhausted. Please upgrade your plan." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Look up the user's preferred image model
  let imageModel: string | null = null;
  try {
    const { data: quotaRow } = await supabaseAdmin
      .from("user_quotas")
      .select("image_model")
      .eq("user_id", user.id)
      .maybeSingle();
    imageModel = (quotaRow as any)?.image_model ?? null;
  } catch {
    // fall back to default
  }

  // Prefer stored Brand Intelligence data; fall back to live fetchBrandColors for old projects
  let brandColors: string[] | null = null;
  let brandContext: Parameters<typeof generateContextualBlogImage>[0]["brandContext"] = null;

  if (project.brand_extracted_at) {
    brandContext = {
      primaryColor:       project.brand_primary_color ?? null,
      secondaryColor:     project.brand_secondary_color ?? null,
      accentColor:        project.brand_accent_color ?? null,
      palette:            project.brand_palette_json ?? null,
      visualStyle:        project.brand_visual_style ?? null,
      designPersonality:  project.brand_design_personality ?? null,
      imageStyle:         project.brand_image_style ?? null,
    };
  } else if (project.domain) {
    try {
      const colors = await fetchBrandColors(project.domain);
      const found = [colors.primaryColor, colors.secondaryColor].filter(Boolean) as string[];
      if (found.length) brandColors = found;
    } catch {
      // ignore
    }
  }

  return runWithUsageLogContext(
    { userId: user.id, projectId: blog.project_id ?? undefined, feature: "blog" },
    async () => {
      try {
        const image = await generateContextualBlogImage({
          title: blog.title,
          targetKeyword: blog.target_keyword,
          articleType: blog.article_type,
          niche: project.niche,
          audience: project.target_audience,
          company: project.company,
          imageAlt: body.imageAlt,
          contextBefore: body.contextBefore,
          contextAfter: body.contextAfter,
          brandContext,
          brandColors,
          imageModel,
        });

        if (!image) {
          return new Response(JSON.stringify({ success: false, error: "Image generation failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ success: true, data: image }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Image generation failed";
        return new Response(JSON.stringify({ success: false, error: message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
  );
}
