/**
 * Plan-based API Access Control.
 * 
 * Provides utilities to check if a user's subscription plan allows
 * access to specific Ahrefs API endpoints.
 */

import { getSupabaseAdmin } from "./supabase";

export type AhrefsApiName =
  | "enable_ahrefs_matching_terms"
  | "enable_ahrefs_organic_competitors"
  | "enable_ahrefs_blog_headings"
  | "enable_ahrefs_blog_faqs";

export interface PlanApiSettings {
  enable_ahrefs_matching_terms: boolean;
  enable_ahrefs_organic_competitors: boolean;
  enable_ahrefs_blog_headings: boolean;
  enable_ahrefs_blog_faqs: boolean;
}

/**
 * Get a user's plan ID from their user ID.
 */
export async function getUserPlanId(userId: string): Promise<string | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("users")
    .select("plan_id")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) {
    console.warn("[plan-api-access] Could not get user plan:", error?.message);
    return null;
  }

  console.log("[plan-api-access] User", userId, "has plan_id:", data.plan_id);
  return data.plan_id ?? "free";
}

/**
 * Get API settings for a specific plan.
 */
export async function getPlanApiSettings(planId: string): Promise<PlanApiSettings> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("subscription_plans")
    .select("enable_ahrefs_matching_terms, enable_ahrefs_organic_competitors, enable_ahrefs_blog_headings, enable_ahrefs_blog_faqs")
    .eq("id", planId)
    .maybeSingle();

  if (error || !data) {
    console.warn("[plan-api-access] Could not get plan settings:", error?.message);
    // Return safe defaults
    return {
      enable_ahrefs_matching_terms: true,
      enable_ahrefs_organic_competitors: true,
      enable_ahrefs_blog_headings: false,
      enable_ahrefs_blog_faqs: false,
    };
  }

  console.log("[plan-api-access] Raw DB plan settings for plan", planId, ":", {
    enable_ahrefs_blog_headings: data.enable_ahrefs_blog_headings,
    enable_ahrefs_blog_faqs: data.enable_ahrefs_blog_faqs,
  });

  return {
    enable_ahrefs_matching_terms: data.enable_ahrefs_matching_terms ?? true,
    enable_ahrefs_organic_competitors: data.enable_ahrefs_organic_competitors ?? true,
    enable_ahrefs_blog_headings: data.enable_ahrefs_blog_headings ?? false,
    enable_ahrefs_blog_faqs: data.enable_ahrefs_blog_faqs ?? false,
  };
}

/**
 * Get API settings for a user by their user ID.
 */
export async function getUserPlanApiSettings(userId: string): Promise<PlanApiSettings> {
  const planId = await getUserPlanId(userId);
  if (!planId) {
    // Return safe defaults if we can't determine the plan
    return {
      enable_ahrefs_matching_terms: true,
      enable_ahrefs_organic_competitors: true,
      enable_ahrefs_blog_headings: false,
      enable_ahrefs_blog_faqs: false,
    };
  }
  return getPlanApiSettings(planId);
}

/**
 * Check if a user has access to a specific Ahrefs API.
 */
export async function checkUserApiAccess(
  userId: string,
  apiName: AhrefsApiName
): Promise<boolean> {
  const settings = await getUserPlanApiSettings(userId);
  return settings[apiName] ?? false;
}

/**
 * Check if a user can use the blog headings API (API #3).
 */
export async function canUseBlogHeadingsApi(userId: string): Promise<boolean> {
  return checkUserApiAccess(userId, "enable_ahrefs_blog_headings");
}

/**
 * Check if a user can use the blog FAQs API (API #4).
 */
export async function canUseBlogFaqsApi(userId: string): Promise<boolean> {
  return checkUserApiAccess(userId, "enable_ahrefs_blog_faqs");
}

/**
 * Check if a user can use the matching terms API (API #1 - Load More).
 */
export async function canUseMatchingTermsApi(userId: string): Promise<boolean> {
  return checkUserApiAccess(userId, "enable_ahrefs_matching_terms");
}

/**
 * Check if a user can use the organic competitors API (API #2 - Benchmark).
 */
export async function canUseOrganicCompetitorsApi(userId: string): Promise<boolean> {
  return checkUserApiAccess(userId, "enable_ahrefs_organic_competitors");
}
