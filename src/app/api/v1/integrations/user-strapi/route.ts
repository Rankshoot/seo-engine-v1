/**
 * /api/v1/integrations/user-strapi
 *
 * GET  — fetch the current user's Strapi integration config (token is masked)
 * POST — save / update (upsert) the user's Strapi integration
 * DELETE — remove the integration
 */

import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { apiJson } from "@/server/http/json";
import { createUserStrapiClient } from "@/services/strapi/user-client";

export const runtime = "nodejs";

function maskToken(token: string): string {
  if (token.length <= 8) return "••••••••";
  return `${token.slice(0, 4)}${"•".repeat(token.length - 8)}${token.slice(-4)}`;
}

export async function GET() {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from("user_cms_integrations")
    .select("id, cms_type, base_url, masked_token, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("cms_type", "strapi")
    .maybeSingle();

  if (error) return apiJson({ success: false, error: error.message }, { status: 500 });

  return apiJson({ success: true, data: data ?? null });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  let body: { base_url?: string; api_token?: string };
  try {
    body = await req.json();
  } catch {
    return apiJson({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { base_url, api_token } = body;
  const collection_name = "articles";
  if (!base_url || !api_token) {
    return apiJson(
      { success: false, error: "base_url and api_token are required" },
      { status: 400 }
    );
  }

  // Validate URL format
  try {
    new URL(base_url);
  } catch {
    return apiJson({ success: false, error: "base_url must be a valid URL" }, { status: 400 });
  }

  // Test connection before saving
  const client = createUserStrapiClient(base_url, api_token);
  const test = await client.testConnection();
  if (!test.ok) {
    return apiJson(
      { success: false, error: `Could not connect to Strapi: ${test.error}` },
      { status: 422 }
    );
  }

  const { error } = await supabaseAdmin
    .from("user_cms_integrations")
    .upsert(
      {
        user_id:         user.id,
        cms_type:        "strapi",
        base_url:        base_url.replace(/\/$/, ""),
        api_token,
        masked_token:    maskToken(api_token),
        collection_name,
        updated_at:      new Date().toISOString(),
      },
      { onConflict: "user_id,cms_type" }
    );

  if (error) return apiJson({ success: false, error: error.message }, { status: 500 });

  return apiJson({ success: true, masked_token: maskToken(api_token) });
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  const { error } = await supabaseAdmin
    .from("user_cms_integrations")
    .delete()
    .eq("user_id", user.id)
    .eq("cms_type", "strapi");

  if (error) return apiJson({ success: false, error: error.message }, { status: 500 });

  return apiJson({ success: true });
}
