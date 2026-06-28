/**
 * POST /api/v1/integrations/user-shopify/test
 *
 * Test a Shopify connection with provided credentials (without saving them).
 * Body: { shop_domain: string; access_token: string; blog_ref?: string }
 */

import { currentUser } from "@clerk/nextjs/server";
import { apiJson } from "@/server/http/json";
import { createUserShopifyClient, normalizeShopDomain } from "@/services/shopify/user-client";

export const runtime = "nodejs";

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
  if (!body.shop_domain || !accessToken) {
    return apiJson({ success: false, error: "shop_domain and access_token are required" }, { status: 400 });
  }

  const shop = normalizeShopDomain(body.shop_domain);
  if (!shop || !shop.includes(".")) {
    return apiJson({ success: false, error: "shop_domain must be a valid store domain" }, { status: 400 });
  }

  const client = createUserShopifyClient(shop, accessToken, (body.blog_ref || "").trim());
  const result = await client.testConnection();

  return apiJson(
    result.ok
      ? { success: true, message: "Connected successfully" }
      : { success: false, error: result.error },
  );
}
