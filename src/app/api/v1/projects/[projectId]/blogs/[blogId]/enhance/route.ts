import { currentUser } from "@clerk/nextjs/server";
import { getBlogById, updateBlogContent } from "@/app/actions/blog-actions";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiJson } from "@/server/http/json";
import { computeSEOScore } from "@/lib/seo-analyzer";
import { enhanceBlogFromDeepAnalysis } from "@/lib/ai/blogEnhancement";
import type { Blog } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string; blogId: string }> }
) {
  const user = await currentUser();
  if (!user) {
    return apiJson({ success: false, error: "Not authenticated", data: null }, { status: 401 });
  }

  const { projectId, blogId } = await params;
  const supabase = getSupabaseAdmin();

  // 1. Authorize project
  const { data: project, error: pErr } = await supabase
    .from("projects")
    .select("id, domain")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr || !project) {
    return apiJson({ success: false, error: "Project not found or unauthorized", data: null }, { status: 404 });
  }

  // 2. Fetch current blog
  const { data: blog, error: bErr } = await supabase
    .from("blogs")
    .select("*")
    .eq("id", blogId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (bErr || !blog) {
    return apiJson({ success: false, error: "Blog not found", data: null }, { status: 404 });
  }

  try {
    const { deepAnalysisResult, seoIssues } = (await req.json()) as {
      deepAnalysisResult: any;
      seoIssues: any[];
    };

    if (!deepAnalysisResult) {
      return apiJson({ success: false, error: "Missing deepAnalysisResult", data: null }, { status: 400 });
    }

    // 3. Compute original SEO score
    const originalScore = computeSEOScore(blog, project.domain).total;

    // 4. Run enhancement AI service
    const enhanced = await enhanceBlogFromDeepAnalysis({
      title: blog.title,
      metaDescription: blog.meta_description || "",
      contentMarkdown: blog.content,
      targetKeyword: blog.target_keyword || "",
      deepAnalysisResult,
      seoIssues: seoIssues || [],
    });

    // 5. Compute enhanced SEO score
    const virtualBlog: Partial<Blog> = {
      ...blog,
      title: enhanced.enhancedTitle,
      meta_description: enhanced.enhancedMetaDescription,
      content: enhanced.enhancedContentMarkdown,
    };
    const enhancedScore = computeSEOScore(virtualBlog, project.domain).total;

    // 6. Safety check: Do not save automatically if score drops
    if (enhancedScore < originalScore) {
      return apiJson({
        success: true,
        saved: false,
        warning: `The enhanced version has a lower SEO score (${enhancedScore}/100) than the original (${originalScore}/100). Original version was kept.`,
        data: {
          enhancedTitle: enhanced.enhancedTitle,
          enhancedMetaDescription: enhanced.enhancedMetaDescription,
          enhancedContentMarkdown: enhanced.enhancedContentMarkdown,
          appliedFixes: enhanced.appliedFixes,
          unresolvedIssues: enhanced.unresolvedIssues,
          improvementSummary: enhanced.improvementSummary,
        },
      });
    }

    // 7. Update original blog with enhanced content
    const updateResult = await updateBlogContent(blogId, enhanced.enhancedContentMarkdown, {
      title: enhanced.enhancedTitle,
      metaDescription: enhanced.enhancedMetaDescription,
    });

    if (!updateResult.success || !updateResult.data) {
      return apiJson({
        success: false,
        error: updateResult.error || "Failed to update blog content.",
        data: null,
      }, { status: 500 });
    }

    return apiJson({
      success: true,
      saved: true,
      data: {
        enhancedTitle: enhanced.enhancedTitle,
        enhancedMetaDescription: enhanced.enhancedMetaDescription,
        enhancedContentMarkdown: enhanced.enhancedContentMarkdown,
        appliedFixes: enhanced.appliedFixes,
        unresolvedIssues: enhanced.unresolvedIssues,
        improvementSummary: enhanced.improvementSummary,
        blog: updateResult.data,
      },
    });
  } catch (err) {
    return apiJson({
      success: false,
      error: err instanceof Error ? err.message : "Enhancement execution failed.",
      data: null,
    }, { status: 500 });
  }
}
