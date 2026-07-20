/**
 * GET /api/v1/integrations/user-wordpress/categories
 *
 * Fetch the current user's WordPress categories using their saved credentials.
 */

import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { apiJson } from "@/server/http/json";
import { createUserWordPressClient } from "@/services/wordpress/user-client";

export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("user_cms_integrations")
    .select("base_url, api_token, collection_name")
    .eq("user_id", user.id)
    .eq("cms_type", "wordpress")
    .maybeSingle();

  if (error) return apiJson({ success: false, error: error.message }, { status: 500 });
  if (!data) return apiJson({ success: false, error: "No WordPress integration configured" }, { status: 404 });

  try {
    const client = createUserWordPressClient(
      data.base_url,
      data.collection_name, // username
      data.api_token, // app password
    );

    const categories = await client.getCategories();
    return apiJson({ success: true, categories });
  } catch (err) {
    console.error("[wordpress-categories-route] failed to fetch categories:", err);
    return apiJson({ success: false, error: "Failed to fetch categories from WordPress" }, { status: 502 });
  }
}
