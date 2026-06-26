/**
 * GET /api/v1/integrations/user-cms
 *
 * Returns the current user's connected CMS integrations across all providers
 * (Strapi, WordPress, …). Used by surfaces that only need to know "is a CMS
 * connected, and which one" — e.g. the Publish button gating — without caring
 * about a specific provider.
 *
 * `data` is the primary (most recently updated) integration, or null.
 */

import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { apiJson } from "@/server/http/json";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("user_cms_integrations")
    .select("cms_type, base_url, masked_token, collection_name, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) return apiJson({ success: false, error: error.message }, { status: 500 });

  const list = data ?? [];
  return apiJson({
    success: true,
    data: list[0] ?? null,
    integrations: list,
  });
}
