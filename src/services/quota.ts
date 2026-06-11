import { getSupabaseAdmin } from "@/lib/supabase";

export class QuotaExhaustedError extends Error {
  constructor(public quotaKey: string, public limit: number) {
    super(`Quota exceeded for ${quotaKey}. Limit is ${limit}.`);
    this.name = "QuotaExhaustedError";
  }
}

export interface QuotaItem {
  limit: number;
  used: number;
  override: number | null;
  effectiveLimit: number;
  remaining: number;
}

export interface UserQuotaStatus {
  planId: string;
  planName: string;
  subscriptionStatus: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  projects: QuotaItem;
  keywords_fetched: QuotaItem;
  keywords_explored: QuotaItem;
  standard_content: QuotaItem;
  premium_content: QuotaItem;
  ai_credits: QuotaItem;
}

export class QuotaService {
  /**
   * Ensures that the user exists in both `users` and `user_quotas` tables.
   * If not, inserts them with default 'free' plan limits.
   */
  static async ensureUserRecords(userId: string, email: string = ""): Promise<void> {
    const db = getSupabaseAdmin();

    // 1. Check/insert user profile
    const { data: userRow } = await db
      .from("users")
      .select("plan_id")
      .eq("id", userId)
      .maybeSingle();

    if (!userRow) {
      await db.from("users").insert({
        id: userId,
        email: email || `user_${userId}@placeholder.com`,
        plan_id: "free",
        subscription_status: "inactive",
      });
    }

    // 2. Check/insert user quota record
    const { data: quotaRow } = await db
      .from("user_quotas")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!quotaRow) {
      // Get the free plan limits
      const { data: freePlan } = await db
        .from("subscription_plans")
        .select("*")
        .eq("id", "free")
        .single();

      const limits = freePlan || {
        limit_projects: 1,
        limit_keywords_fetched: 50,
        limit_keywords_explored: 10,
        limit_standard_content: 2,
        limit_premium_content: 0,
        limit_ai_credits: 10,
      };

      await db.from("user_quotas").insert({
        user_id: userId,
        limit_projects: limits.limit_projects,
        limit_keywords_fetched: limits.limit_keywords_fetched,
        limit_keywords_explored: limits.limit_keywords_explored,
        limit_standard_content: limits.limit_standard_content,
        limit_premium_content: limits.limit_premium_content,
        limit_ai_credits: limits.limit_ai_credits,
        used_projects: 0,
        used_keywords_fetched: 0,
        used_keywords_explored: 0,
        used_standard_content: 0,
        used_premium_content: 0,
        used_ai_credits: 0,
      });
    }
  }

  /**
   * Fetches the complete subscription and quota status for a user.
   */
  static async getUserQuotaStatus(userId: string): Promise<UserQuotaStatus> {
    const db = getSupabaseAdmin();

    // Ensure records are present first (fallback if clerk user signed in but didn't run webhook)
    await this.ensureUserRecords(userId);

    // Fetch user plan and quota info
    const { data: userProfile, error: userErr } = await db
      .from("users")
      .select(`
        plan_id,
        subscription_status,
        stripe_customer_id,
        stripe_subscription_id,
        subscription_plans (
          name
        )
      `)
      .eq("id", userId)
      .single();

    if (userErr || !userProfile) {
      throw new Error(`Failed to load subscription details for user ${userId}`);
    }

    const { data: quotas, error: quotaErr } = await db
      .from("user_quotas")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (quotaErr || !quotas) {
      throw new Error(`Failed to load quota limits for user ${userId}`);
    }

    // 1. Compute dynamic real-time counts from DB tables
    const { count: actualProjectsCount, error: projErr } = await db
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const { data: userProjects, error: userProjErr } = await db
      .from("projects")
      .select("id")
      .eq("user_id", userId);

    const projectIds = (userProjects ?? []).map((p) => p.id);

    let actualStandardCount = 0;
    let actualPremiumCount = 0;
    let actualKeywordsCount = 0;

    let stdErr = null;
    let premErr = null;
    let kwErr = null;

    if (projectIds.length > 0) {
      const [stdCountRes, premCountRes, kwCountRes] = await Promise.all([
        db
          .from("blogs")
          .select("id", { count: "exact", head: true })
          .in("project_id", projectIds)
          .in("content_type", ["blog", "linkedin"]),
        db
          .from("blogs")
          .select("id", { count: "exact", head: true })
          .in("project_id", projectIds)
          .in("content_type", ["ebook", "whitepaper"]),
        db
          .from("keywords")
          .select("id", { count: "exact", head: true })
          .in("project_id", projectIds),
      ]);

      actualStandardCount = stdCountRes.count ?? 0;
      actualPremiumCount = premCountRes.count ?? 0;
      actualKeywordsCount = kwCountRes.count ?? 0;

      stdErr = stdCountRes.error ? stdCountRes.error.message : null;
      premErr = premCountRes.error ? premCountRes.error.message : null;
      kwErr = kwCountRes.error ? kwCountRes.error.message : null;
    }

    const logData = {
      timestamp: new Date().toISOString(),
      userId,
      actualProjectsCount,
      projectIds,
      projErr: projErr ? projErr.message : null,
      userProjErr: userProjErr ? userProjErr.message : null,
      actualStandardCount,
      stdErr,
      actualPremiumCount,
      premErr,
      actualKeywordsCount,
      kwErr
    };
    try {
      require("fs").appendFileSync("c:/Users/prabh/seo engine/seo-engine/debug.log", JSON.stringify(logData, null, 2) + "\n---\n");
    } catch (e) {
      console.error("Failed to write to debug.log", e);
    }

    const mapQuota = (
      limit: number,
      used: number,
      override: number | null
    ): QuotaItem => {
      const effectiveLimit = override !== null ? override : limit;
      return {
        limit,
        used,
        override,
        effectiveLimit,
        remaining: Math.max(0, effectiveLimit - used),
      };
    };

    const planObj = userProfile.subscription_plans as any;
    const planName = Array.isArray(planObj)
      ? planObj[0]?.name
      : planObj?.name || "Free Tier";

    return {
      planId: userProfile.plan_id,
      planName,
      subscriptionStatus: userProfile.subscription_status,
      stripeCustomerId: userProfile.stripe_customer_id,
      stripeSubscriptionId: userProfile.stripe_subscription_id,
      projects: mapQuota(quotas.limit_projects, actualProjectsCount ?? 0, quotas.override_projects),
      keywords_fetched: mapQuota(
        quotas.limit_keywords_fetched,
        actualKeywordsCount,
        quotas.override_keywords_fetched
      ),
      keywords_explored: mapQuota(
        quotas.limit_keywords_explored,
        quotas.used_keywords_explored,
        quotas.override_keywords_explored
      ),
      standard_content: mapQuota(
        quotas.limit_standard_content,
        actualStandardCount,
        quotas.override_standard_content
      ),
      premium_content: mapQuota(
        quotas.limit_premium_content,
        actualPremiumCount,
        quotas.override_premium_content
      ),
      ai_credits: mapQuota(quotas.limit_ai_credits, quotas.used_ai_credits, quotas.override_ai_credits),
    };
  }

  /**
   * Validates if a user has sufficient quota remaining for the specified key.
   * Throws a QuotaExhaustedError if quota is exceeded.
   */
  static async checkQuota(
    userId: string,
    key: "projects" | "keywords_fetched" | "keywords_explored" | "standard_content" | "premium_content" | "ai_credits",
    amount: number = 1
  ): Promise<void> {
    const status = await this.getUserQuotaStatus(userId);
    const item = status[key];
    if (item.used + amount > item.effectiveLimit) {
      throw new QuotaExhaustedError(key, item.effectiveLimit);
    }
  }

  /**
   * Atomically checks and deducts quota.
   * Utilizes the Postgres RPC function `deduct_user_quota` to avoid race conditions.
   * Throws QuotaExhaustedError if limits are exceeded.
   */
  static async deductQuota(
    userId: string,
    key: "projects" | "keywords_fetched" | "keywords_explored" | "standard_content" | "premium_content" | "ai_credits",
    amount: number = 1
  ): Promise<void> {
    const db = getSupabaseAdmin();

    // Pre-flight check to throw descriptive error early
    await this.checkQuota(userId, key, amount);

    const { data: success, error } = await db.rpc("deduct_user_quota", {
      p_user_id: userId,
      p_quota_key: key,
      p_amount: amount,
    });

    if (error) {
      throw new Error(`Quota deduction transaction failed: ${error.message}`);
    }

    if (!success) {
      // Re-run checks to report current limits accurately
      const status = await this.getUserQuotaStatus(userId);
      throw new QuotaExhaustedError(key, status[key].effectiveLimit);
    }
  }

  /**
   * Upgrades or updates a user's subscription and synchronizes quotas.
   * Preserves any existing admin-specific overrides.
   */
  static async updateUserSubscription(
    userId: string,
    planId: string,
    stripeCustomerId: string,
    stripeSubscriptionId: string | null,
    status: string
  ): Promise<void> {
    const db = getSupabaseAdmin();

    // Ensure user profile details are present
    await this.ensureUserRecords(userId);

    // 1. Update user record
    const { error: userErr } = await db.from("users").upsert({
      id: userId,
      plan_id: planId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      subscription_status: status,
      updated_at: new Date().toISOString(),
    });

    if (userErr) {
      throw new Error(`Failed to update subscription details for ${userId}: ${userErr.message}`);
    }

    // 2. Fetch the plan limits
    const { data: plan, error: planErr } = await db
      .from("subscription_plans")
      .select("*")
      .eq("id", planId)
      .single();

    if (planErr || !plan) {
      throw new Error(`Failed to fetch limits for plan ${planId}`);
    }

    // 3. Fetch existing quotas (to preserve overrides if any, and optionally current usage)
    const { data: existingQuotas } = await db
      .from("user_quotas")
      .select("*")
      .eq("user_id", userId)
      .single();

    const newQuotas: Record<string, any> = {
      user_id: userId,
      limit_projects: plan.limit_projects,
      limit_keywords_fetched: plan.limit_keywords_fetched,
      limit_keywords_explored: plan.limit_keywords_explored,
      limit_standard_content: plan.limit_standard_content,
      limit_premium_content: plan.limit_premium_content,
      limit_ai_credits: plan.limit_ai_credits,
      updated_at: new Date().toISOString(),
    };

    // If upgrading to active subscription, replenish (reset) standard counters
    if (status === "active") {
      newQuotas.used_keywords_fetched = 0;
      newQuotas.used_keywords_explored = 0;
      newQuotas.used_standard_content = 0;
      newQuotas.used_premium_content = 0;
      newQuotas.used_ai_credits = 0;
    }

    const { error: quotaErr } = await db.from("user_quotas").upsert(newQuotas);

    if (quotaErr) {
      throw new Error(`Failed to synchronize user limits for ${userId}: ${quotaErr.message}`);
    }
  }
}
