/**
 * /api/v1/integrations/user-shopify
 *
 * GET    — fetch the current user's Shopify integration (token masked)
 * POST   — save / update (upsert) the user's Shopify integration
 * DELETE — remove it
 *
 * Reuses `user_cms_integrations` with cms_type='shopify' (no migration):
 *   base_url=myshopify domain, api_token=Admin API access token,
 *   collection_name=target Blog id/handle (optional; defaults to first blog).
 */

import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { apiJson } from "@/server/http/json";
import { createUserShopifyClient, normalizeShopDomain } from "@/services/shopify/user-client";

export const runtime = "nodejs";

function maskToken(token: string): string {
  const t = token.trim();
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
    .eq("cms_type", "shopify")
    .maybeSingle();

  if (error) return apiJson({ success: false, error: error.message }, { status: 500 });

  const shaped = data
    ? { ...data, blog_ref: (data as { collection_name?: string }).collection_name ?? "" }
    : null;

  return apiJson({ success: true, data: shaped });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  let body: { shop_domain?: string; access_token?: string; blog_ref?: string };
  try {
    body = await req.json();
  } catch {
    return apiJson({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const accessToken = (body.access_token || "").trim();
  const blogRef = (body.blog_ref || "").trim();
  if (!body.shop_domain || !accessToken) {
    return apiJson(
      { success: false, error: "shop_domain and access_token are required" },
      { status: 400 },
    );
  }

  const shop = normalizeShopDomain(body.shop_domain);
  if (!shop || !shop.includes(".")) {
    return apiJson({ success: false, error: "shop_domain must be a valid store domain" }, { status: 400 });
  }

  // Verify the token (and the content scope) before persisting.
  const client = createUserShopifyClient(shop, accessToken, blogRef);
  const test = await client.testConnection();
  if (!test.ok) {
    return apiJson(
      { success: false, error: `Could not connect to Shopify: ${test.error}` },
      { status: 422 },
    );
  }

  const { error } = await supabaseAdmin.from("user_cms_integrations").upsert(
    {
      user_id: user.id,
      cms_type: "shopify",
      base_url: shop,
      api_token: accessToken,
      masked_token: maskToken(accessToken),
      collection_name: blogRef, // target Blog id/handle (no schema change)
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,cms_type" },
  );

  if (error) return apiJson({ success: false, error: error.message }, { status: 500 });

  return apiJson({ success: true, masked_token: maskToken(accessToken) });
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return apiJson({ success: false, error: "Not authenticated" }, { status: 401 });

  const { error } = await supabaseAdmin
    .from("user_cms_integrations")
    .delete()
    .eq("user_id", user.id)
    .eq("cms_type", "shopify");

  if (error) return apiJson({ success: false, error: error.message }, { status: 500 });

  return apiJson({ success: true });
}
