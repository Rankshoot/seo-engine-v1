"use server";

import { getSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/require-admin";
import { revalidatePath } from "next/cache";

export interface PlanUpdateInput {
  name: string;
  monthly_price: number;
  stripe_price_id: string | null;
  limit_projects: number;
  limit_keywords_fetched: number;
  limit_keywords_explored: number;
  limit_standard_content: number;
  limit_premium_content: number;
  limit_ai_credits: number;
  // Ahrefs API controls
  enable_ahrefs_matching_terms?: boolean;
  enable_ahrefs_organic_competitors?: boolean;
  enable_ahrefs_blog_headings?: boolean;
  enable_ahrefs_blog_faqs?: boolean;
}

/**
 * Loads all subscription plans from the DB. Admin access required.
 */
export async function getSubscriptionPlans() {
  const adminCheck = await requireAdmin({ minRole: "admin" });
  if (!adminCheck.ok) {
    throw new Error("Unauthorized: Admin role required.");
  }

  const db = getSupabaseAdmin();
  const { data: plans, error } = await db
    .from("subscription_plans")
    .select("*")
    .order("monthly_price", { ascending: true });

  if (error) {
    throw new Error(`Failed to load subscription plans: ${error.message}`);
  }

  return plans;
}

/**
 * Updates a plan's pricing and limit variables in the database.
 * Revalidates the pricing page cache immediately.
 */
export async function updateSubscriptionPlan(
  planId: string,
  updates: PlanUpdateInput
) {
  const adminCheck = await requireAdmin({ minRole: "admin" });
  if (!adminCheck.ok) {
    throw new Error("Unauthorized: Admin role required.");
  }

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("subscription_plans")
    .update({
      name: updates.name,
      monthly_price: updates.monthly_price,
      stripe_price_id: updates.stripe_price_id || null,
      limit_projects: updates.limit_projects,
      limit_keywords_fetched: updates.limit_keywords_fetched,
      limit_keywords_explored: updates.limit_keywords_explored,
      limit_standard_content: updates.limit_standard_content,
      limit_premium_content: updates.limit_premium_content,
      limit_ai_credits: updates.limit_ai_credits,
      // Ahrefs API controls
      enable_ahrefs_matching_terms: updates.enable_ahrefs_matching_terms ?? true,
      enable_ahrefs_organic_competitors: updates.enable_ahrefs_organic_competitors ?? true,
      enable_ahrefs_blog_headings: updates.enable_ahrefs_blog_headings ?? false,
      enable_ahrefs_blog_faqs: updates.enable_ahrefs_blog_faqs ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", planId);

  if (error) {
    throw new Error(`Failed to update subscription plan: ${error.message}`);
  }

  // Purge the cached static page for pricing and homepage so updates take effect instantly
  revalidatePath("/pricing");
  revalidatePath("/");

  return { success: true };
}

/**
 * Creates a new subscription plan in the database.
 * Revalidates the pricing page and homepage caches immediately.
 */
export async function createSubscriptionPlan(
  planId: string,
  planData: PlanUpdateInput
) {
  const adminCheck = await requireAdmin({ minRole: "admin" });
  if (!adminCheck.ok) {
    throw new Error("Unauthorized: Admin role required.");
  }

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("subscription_plans")
    .insert({
      id: planId.trim().toLowerCase(),
      name: planData.name,
      monthly_price: planData.monthly_price,
      stripe_price_id: planData.stripe_price_id || null,
      limit_projects: planData.limit_projects,
      limit_keywords_fetched: planData.limit_keywords_fetched,
      limit_keywords_explored: planData.limit_keywords_explored,
      limit_standard_content: planData.limit_standard_content,
      limit_premium_content: planData.limit_premium_content,
      limit_ai_credits: planData.limit_ai_credits,
      // Ahrefs API controls (defaults)
      enable_ahrefs_matching_terms: planData.enable_ahrefs_matching_terms ?? true,
      enable_ahrefs_organic_competitors: planData.enable_ahrefs_organic_competitors ?? true,
      enable_ahrefs_blog_headings: planData.enable_ahrefs_blog_headings ?? false,
      enable_ahrefs_blog_faqs: planData.enable_ahrefs_blog_faqs ?? false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (error) {
    throw new Error(`Failed to create subscription plan: ${error.message}`);
  }

  // Purge the cached pages so the new plan renders immediately
  revalidatePath("/pricing");
  revalidatePath("/");

  return { success: true };
}

