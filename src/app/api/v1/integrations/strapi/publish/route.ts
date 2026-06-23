/**
 * POST /api/v1/integrations/strapi/publish
 *
 * Publishes a blog (by blogId) to Rankshoot's own Strapi instance.
 * Also marks the blog status as "published" in Supabase.
 *
 * Body: { blogId: string }
 */

import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { apiJson } from "@/server/http/json";
import { strapiClient, StrapiApiError } from "@/services/strapi/client";
import type { Blog } from "@/lib/types";

export const runtime = "nodejs";

function buildExcerpt(content: string, maxLen = 200): string {
  const stripped = content.replace(/^#+\s.*$/gm, "").replace(/[*_`#\[\]]/g, "").trim();
  const first = stripped.split("\n").find(l => l.trim().length > 30) ?? stripped;
  return first.length > maxLen ? `${first.slice(0, maxLen - 1)}…` : first;
}

function extractCoverImageUrl(content: string): string | null {
  const match = content.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
  return match ? match[1] : null;
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  if (!strapiClient.isConfigured()) {
    return apiJson(
      { success: false, error: "Strapi is not configured on this server. Set STRAPI_URL and STRAPI_API_TOKEN." },
      { status: 503 }
    );
  }

  let blogId: string;
  try {
    const body = (await req.json()) as { blogId?: string };
    if (!body.blogId) return apiJson({ success: false, error: "blogId is required" }, { status: 400 });
    blogId = body.blogId;
  } catch {
    return apiJson({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const { data: blog, error: blogErr } = await supabaseAdmin
    .from("blogs")
    .select("*")
    .eq("id", blogId)
    .single<Blog>();

  if (blogErr || !blog) {
    return apiJson({ success: false, error: "Blog not found" }, { status: 404 });
  }

  // Ensure the requesting user owns the project this blog belongs to
  if (blog.project_id) {
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("user_id")
      .eq("id", blog.project_id)
      .single<{ user_id: string }>();

    if (!project || project.user_id !== user.id) {
      return apiJson({ success: false, error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const article = await strapiClient.publishArticle({
      title:           blog.title,
      slug:            blog.slug,
      content:         blog.content,
      excerpt:         buildExcerpt(blog.content),
      meta_description: blog.meta_description,
      target_keyword:  blog.target_keyword,
      seo_score:       null,
      word_count:      blog.word_count ?? null,
      cover_image_url: extractCoverImageUrl(blog.content),
      source_blog_id:  blog.id,
    });

    // Mark blog as published in Supabase
    await supabaseAdmin
      .from("blogs")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", blogId);

    // Sync calendar entry status if present
    if (blog.entry_id) {
      await supabaseAdmin
        .from("calendar_entries")
        .update({ status: "published" })
        .eq("id", blog.entry_id);
    }

    return apiJson({
      success:    true,
      documentId: article.documentId,
      slug:       article.slug,
      publishedAt: article.publishedAt,
    });
  } catch (err) {
    if (err instanceof StrapiApiError) {
      return apiJson(
        { success: false, error: err.strapiError, status: err.status },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 }
      );
    }
    console.error("[strapi/publish] unexpected error", err);
    return apiJson({ success: false, error: "Failed to publish to Strapi" }, { status: 500 });
  }
}
