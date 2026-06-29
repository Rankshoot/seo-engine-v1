/**
 * /api/v1/integrations/user-wordpress
 *
 * GET    — fetch the current user's WordPress integration (app password masked)
 * POST   — save / update (upsert) the user's WordPress integration
 * DELETE — remove it
 *
 * Reuses `user_cms_integrations` with cms_type='wordpress' (no migration):
 *   base_url=site URL, collection_name=WordPress username, api_token=App Password.
 */

import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { apiJson } from "@/server/http/json";
import { createUserWordPressClient, normalizeWordPressBaseUrl } from "@/services/wordpress/user-client";

export const runtime = "nodejs";

function maskToken(token: string): string {
  const t = token.replace(/\s+/g, "");
  if (t.length <= 8) return "••••••••";
  return `${t.slice(0, 4)}${"•".repeat(t.length - 8)}${t.slice(-4)}`;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("user_cms_integrations")
    .select("id, cms_type, base_url, masked_token, collection_name, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("cms_type", "wordpress")
    .maybeSingle();

  if (error) return apiJson({ success: false, error: error.message }, { status: 500 });

  // `collection_name` holds the WordPress username — surface it under a clear key.
  const shaped = data
    ? { ...data, username: (data as { collection_name?: string }).collection_name ?? "" }
    : null;

  return apiJson({ success: true, data: shaped });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  let body: { base_url?: string; username?: string; app_password?: string };
  try {
    body = await req.json();
  } catch {
    return apiJson({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const username = (body.username || "").trim();
  const appPassword = (body.app_password || "").trim();
  if (!body.base_url || !username || !appPassword) {
    return apiJson(
      { success: false, error: "base_url, username and app_password are required" },
      { status: 400 },
    );
  }

  const cleanUrl = normalizeWordPressBaseUrl(body.base_url);
  try {
    new URL(cleanUrl);
  } catch {
    return apiJson({ success: false, error: "base_url must be a valid URL" }, { status: 400 });
  }

  // Verify the credentials before persisting.
  const client = createUserWordPressClient(cleanUrl, username, appPassword);
  const test = await client.testConnection();
  if (!test.ok) {
    return apiJson(
      { success: false, error: `Could not connect to WordPress: ${test.error}` },
      { status: 422 },
    );
  }

  const { error } = await supabaseAdmin.from("user_cms_integrations").upsert(
    {
      user_id: user.id,
      cms_type: "wordpress",
      base_url: cleanUrl,
      api_token: appPassword,
      masked_token: maskToken(appPassword),
      collection_name: username, // username stored here (no schema change)
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,cms_type" },
  );

  if (error) return apiJson({ success: false, error: error.message }, { status: 500 });

  return apiJson({ success: true, masked_token: maskToken(appPassword) });
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  const { error } = await supabaseAdmin
    .from("user_cms_integrations")
    .delete()
    .eq("user_id", user.id)
    .eq("cms_type", "wordpress");

  if (error) return apiJson({ success: false, error: error.message }, { status: 500 });

  return apiJson({ success: true });
}
