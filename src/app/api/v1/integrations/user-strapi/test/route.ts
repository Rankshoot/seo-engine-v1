/**
 * POST /api/v1/integrations/user-strapi/test
 *
 * Test a Strapi connection with provided credentials (without saving them).
 * Body: { base_url: string; api_token: string }
 */

import { currentUser } from "@clerk/nextjs/server";
import { apiJson } from "@/server/http/json";
import { createUserStrapiClient } from "@/services/strapi/user-client";

export const runtime = "nodejs";

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
  if (!base_url || !api_token) {
    return apiJson({ success: false, error: "base_url and api_token are required" }, { status: 400 });
  }

  try {
    new URL(base_url);
  } catch {
    return apiJson({ success: false, error: "base_url must be a valid URL" }, { status: 400 });
  }

  const client = createUserStrapiClient(base_url, api_token);
  const result = await client.testConnection();

  return apiJson(result.ok
    ? { success: true, message: "Connected successfully" }
    : { success: false, error: result.error }
  );
}
