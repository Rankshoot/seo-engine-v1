/**
 * POST /api/v1/blogs/[blogId]/publish-cms
 *
 * Publish a blog to the authenticated user's configured Strapi CMS.
 * Requires user to have saved a Strapi integration via /api/v1/integrations/user-strapi.
 */

import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { apiJson } from "@/server/http/json";
import { createUserStrapiClient, StrapiUserClientError } from "@/services/strapi/user-client";
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

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ blogId: string }> }
) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  const { blogId } = await params;

  // Load user's CMS integration
  const { data: integration, error: intErr } = await supabaseAdmin
    .from("user_cms_integrations")
    .select("base_url, api_token, collection_name")
    .eq("user_id", user.id)
    .eq("cms_type", "strapi")
    .maybeSingle<{ base_url: string; api_token: string; collection_name: string }>();

  if (intErr) return apiJson({ success: false, error: intErr.message }, { status: 500 });
  if (!integration) {
    return apiJson(
      { success: false, error: "No Strapi integration configured. Add it in Settings → Integrations." },
      { status: 422 }
    );
  }

  // Load blog and verify ownership
  const { data: blog, error: blogErr } = await supabaseAdmin
    .from("blogs")
    .select("*")
    .eq("id", blogId)
    .single<Blog>();

  if (blogErr || !blog) return apiJson({ success: false, error: "Blog not found" }, { status: 404 });

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

  const client = createUserStrapiClient(integration.base_url, integration.api_token, integration.collection_name);

  try {
    const result = await client.publishArticle({
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

    // Mark published in our DB
    await supabaseAdmin
      .from("blogs")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", blogId);

    if (blog.entry_id) {
      await supabaseAdmin
        .from("calendar_entries")
        .update({ status: "published" })
        .eq("id", blog.entry_id);
    }

    return apiJson({
      success:    true,
      documentId: result.documentId,
      slug:       result.slug,
      strapiUrl:  `${integration.base_url}/api/${integration.collection_name}?filters[slug][$eq]=${result.slug}`,
    });
  } catch (err) {
    if (err instanceof StrapiUserClientError) {
      return apiJson(
        { success: false, error: err.strapiError },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 }
      );
    }
    console.error("[publish-cms] unexpected error", err);
    return apiJson({ success: false, error: "Failed to publish to your CMS" }, { status: 500 });
  }
}
