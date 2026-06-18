import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { aiGenerateStructured } from "@/services/ai/providers";
import { sectionSchema } from "@/lib/landing-page-studio";
import { apiJson } from "@/server/http/json";
import { runWithUsageLogContext } from "@/lib/admin/logging/log-context";
import { QuotaService } from "@/services/quota";
import type { Blog, LandingPageContentData } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ blogId: string }> }
) {
  const user = await currentUser();
  if (!user) {
    return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const { blogId } = await params;

  let body: { sectionIndex: number; instruction: string };
  try {
    body = await req.json();
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { sectionIndex, instruction } = body;
  if (typeof sectionIndex !== "number" || !instruction?.trim()) {
    return apiJson(
      { success: false, error: "Missing sectionIndex or instruction" },
      { status: 400 }
    );
  }

  // 1. Fetch the blog and join project
  const { data: blog, error: bErr } = await supabaseAdmin
    .from("blogs")
    .select("*, projects(*)")
    .eq("id", blogId)
    .single();

  if (bErr || !blog) {
    return apiJson({ success: false, error: "Landing page not found" }, { status: 404 });
  }

  if (blog.content_type !== "landing_page") {
    return apiJson({ success: false, error: "Not a landing page content type" }, { status: 400 });
  }

  const project = blog.projects;
  if (!project || project.user_id !== user.id) {
    return apiJson({ success: false, error: "Not authorized" }, { status: 403 });
  }

  const contentData = (blog.content_data ?? {}) as LandingPageContentData;
  const sections = contentData.sections ?? [];

  if (sectionIndex < 0 || sectionIndex >= sections.length) {
    return apiJson({ success: false, error: "Invalid section index" }, { status: 400 });
  }

  const targetSection = sections[sectionIndex];

  // 2. Check and deduct AI credit quota
  try {
    await QuotaService.checkQuota(user.id, "ai_credits");
  } catch (e: any) {
    return apiJson(
      {
        success: false,
        error: e?.message || "You have exhausted your AI helper credits. Please upgrade your plan.",
      },
      { status: 403 }
    );
  }

  // 3. Prepare AI Prompts
  const systemPrompt = `You are an expert conversion copywriter and SEO landing page editor.
Your task is to rewrite a single section of a brand-styled landing page according to the user's instructions and project context.

Design Guidelines:
- Primary Brand Color: ${project.brand_primary_color || "default"}
- Layout Theme: ${project.brand_theme || "light"}
- Button Style: ${project.brand_button_style || "rounded-full"}
- Font Family Stack: ${project.brand_font_family || "Inter, sans-serif"}

Project Context:
- Company Name: ${project.company || "Studio"}
- Domain: ${project.domain || ""}
- Niche/Industry: ${project.niche || ""}
- Target Audience: ${project.target_audience || ""}
- Primary Keyword: ${blog.target_keyword || ""}
- Custom Landing Page Instructions: ${project.brand_landing_page_instruction || "None"}

Quality Rules:
- Output must strictly follow the JSON structure for the section type "${targetSection.type}".
- Return accurate, real information, and NEVER use dummy data or generic placeholder text (like "lorem ipsum").
- Maintain strict style consistency with Taggd's layout.
- Wrap key branding terms, keywords, or emphasized phrases in headlines or titles in double asterisks \`**highlighted text**\` (e.g., "Recruitment Strategies that Fill Roles **Faster & Smarter**") so that they can be styled in the brand's accent color (supporting two-color text highlighting).
- Testimonials and stats must be plausible and authentic.

Return ONLY a valid JSON object matching the schema for section type "${targetSection.type}".`;

  const prompt = `Rewrite this section of type "${targetSection.type}" based on the instruction.

Current Section JSON:
\`\`\`json
${JSON.stringify(targetSection, null, 2)}
\`\`\`

User Instruction:
"${instruction}"

Output the updated section JSON object matching the "${targetSection.type}" schema structure exactly.`;

  // 4. Run structured call under usage logging context
  return runWithUsageLogContext(
    { userId: user.id, projectId: project.id, feature: "landing-page" },
    async () => {
      try {
        const rewrittenSection = await aiGenerateStructured(
          "landing-page", // Resolves to Claude default route
          prompt,
          sectionSchema,
          {
            systemPrompt,
            temperature: 0.7,
            userId: user.id,
            projectId: project.id,
            timeoutMs: 60000,
          }
        );

        // 5. Update the section in content_data and save to DB
        const updatedSections = [...sections];
        updatedSections[sectionIndex] = rewrittenSection;
        const updatedContentData: LandingPageContentData = {
          ...contentData,
          sections: updatedSections,
        };

        const { data: updatedBlog, error: updateErr } = await supabaseAdmin
          .from("blogs")
          .update({
            content_data: updatedContentData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", blogId)
          .select()
          .single();

        if (updateErr || !updatedBlog) {
          throw new Error(updateErr?.message || "Failed to update landing page in DB");
        }

        return apiJson({ success: true, data: updatedBlog as Blog });
      } catch (err: any) {
        return apiJson(
          { success: false, error: err?.message || "AI rewrite failed" },
          { status: 500 }
        );
      }
    }
  );
}
