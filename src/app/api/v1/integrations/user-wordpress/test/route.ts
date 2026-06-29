/**
 * POST /api/v1/integrations/user-wordpress/test
 *
 * Test a WordPress connection with provided credentials (without saving them).
 * Body: { base_url: string; username: string; app_password: string }
 */

import { currentUser } from "@clerk/nextjs/server";
import { apiJson } from "@/server/http/json";
import { createUserWordPressClient, normalizeWordPressBaseUrl } from "@/services/wordpress/user-client";

export const runtime = "nodejs";

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

  const client = createUserWordPressClient(cleanUrl, username, appPassword);
  const result = await client.testConnection();

  return apiJson(
    result.ok
      ? { success: true, message: "Connected successfully" }
      : { success: false, error: result.error },
  );
}
