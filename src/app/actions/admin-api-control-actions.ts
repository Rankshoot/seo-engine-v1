"use server";

/**
 * Admin API Control actions.
 * 
 * Manages per-plan Ahrefs API access toggles. These control which APIs
 * are available to users based on their subscription plan.
 */

import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/require-admin";
import { revalidatePath } from "next/cache";

export interface ApiControlSettings {
  enable_ahrefs_matching_terms: boolean;
  enable_ahrefs_organic_competitors: boolean;
  enable_ahrefs_blog_headings: boolean;
  enable_ahrefs_blog_faqs: boolean;
}

export interface PlanWithApiControl {
  id: string;
  name: string;
  monthly_price: number;
  api_settings: ApiControlSettings;
}

/**
 * Loads all subscription plans with their API control settings.
 * Admin access required.
 */
export async function getApiControlSettings(): Promise<PlanWithApiControl[]> {
  const adminCheck = await requireAdmin({ minRole: "admin" });
  if (!adminCheck.ok) {
    throw new Error("Unauthorized: Admin role required.");
  }

  const db = getSupabaseAdmin();
  const { data: plans, error } = await db
    .from("subscription_plans")
    .select("id, name, monthly_price, enable_ahrefs_matching_terms, enable_ahrefs_organic_competitors, enable_ahrefs_blog_headings, enable_ahrefs_blog_faqs")
    .order("monthly_price", { ascending: true });

  if (error) {
    throw new Error(`Failed to load API control settings: ${error.message}`);
  }

  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    monthly_price: plan.monthly_price,
    api_settings: {
      enable_ahrefs_matching_terms: plan.enable_ahrefs_matching_terms ?? true,
      enable_ahrefs_organic_competitors: plan.enable_ahrefs_organic_competitors ?? true,
      enable_ahrefs_blog_headings: plan.enable_ahrefs_blog_headings ?? false,
      enable_ahrefs_blog_faqs: plan.enable_ahrefs_blog_faqs ?? false,
    },
  }));
}

/**
 * Updates API control settings for a specific plan.
 * Admin access required.
 */
export async function updateApiControlForPlan(
  planId: string,
  settings: ApiControlSettings
): Promise<{ success: boolean }> {
  const adminCheck = await requireAdmin({ minRole: "admin" });
  if (!adminCheck.ok) {
    throw new Error("Unauthorized: Admin role required.");
  }

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("subscription_plans")
    .update({
      enable_ahrefs_matching_terms: settings.enable_ahrefs_matching_terms,
      enable_ahrefs_organic_competitors: settings.enable_ahrefs_organic_competitors,
      enable_ahrefs_blog_headings: settings.enable_ahrefs_blog_headings,
      enable_ahrefs_blog_faqs: settings.enable_ahrefs_blog_faqs,
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId);

  if (error) {
    throw new Error(`Failed to update API control settings: ${error.message}`);
  }

  // Revalidate admin pages
  revalidatePath("/admin/api-control");

  return { success: true };
}

/**
 * Bulk update API control settings for multiple plans.
 * Admin access required.
 */
export async function updateBulkApiControl(
  updates: Array<{ planId: string; settings: ApiControlSettings }>
): Promise<{ success: boolean; updated: number }> {
  const adminCheck = await requireAdmin({ minRole: "admin" });
  if (!adminCheck.ok) {
    throw new Error("Unauthorized: Admin role required.");
  }

  const db = getSupabaseAdmin();
  let updated = 0;

  for (const { planId, settings } of updates) {
    const { error } = await db
      .from("subscription_plans")
      .update({
        enable_ahrefs_matching_terms: settings.enable_ahrefs_matching_terms,
        enable_ahrefs_organic_competitors: settings.enable_ahrefs_organic_competitors,
        enable_ahrefs_blog_headings: settings.enable_ahrefs_blog_headings,
        enable_ahrefs_blog_faqs: settings.enable_ahrefs_blog_faqs,
        updated_at: new Date().toISOString(),
      })
      .eq("id", planId);

    if (!error) {
      updated++;
    }
  }

  // Revalidate admin pages
  revalidatePath("/admin/api-control");

  return { success: true, updated };
}
