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
  // Granular content-type limits
  blogs: QuotaItem;
  ebooks: QuotaItem;
  whitepapers: QuotaItem;
  linkedin: QuotaItem;
  ai_credits: QuotaItem;
  // Legacy aliases (computed from granular)
  standard_content: QuotaItem;
  premium_content: QuotaItem;
}

/** The set of quota keys accepted by checkQuota / deductQuota. */
export type QuotaKey =
  | "projects"
  | "keywords_fetched"
  | "keywords_explored"
  | "blogs"
  | "ebooks"
  | "whitepapers"
  | "linkedin"
  | "ai_credits"
  // Legacy aliases kept for backwards-compat with existing call-sites
  | "standard_content"
  | "premium_content";

/** Lightweight shape returned to the client (no sensitive plan data). */
export interface ClientQuotaStatus {
  planId: string;
  planName: string;
  projects: QuotaItem;
  keywords_fetched: QuotaItem;
  keywords_explored: QuotaItem;
  blogs: QuotaItem;
  ebooks: QuotaItem;
  whitepapers: QuotaItem;
  linkedin: QuotaItem;
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
      const { data: freePlan } = await db
        .from("subscription_plans")
        .select("*")
        .eq("id", "free")
        .single();

      const limits = freePlan || {
        limit_projects: 1,
        limit_keywords_fetched: 50,
        limit_keywords_explored: 10,
        limit_blogs: 5,
        limit_ebooks: 0,
        limit_whitepapers: 0,
        limit_linkedin: 5,
        limit_ai_credits: 10,
        // Legacy
        limit_standard_content: 5,
        limit_premium_content: 0,
      };

      await db.from("user_quotas").insert({
        user_id: userId,
        limit_projects: limits.limit_projects,
        limit_keywords_fetched: limits.limit_keywords_fetched,
        limit_keywords_explored: limits.limit_keywords_explored,
        limit_blogs: (limits as any).limit_blogs ?? 5,
        limit_ebooks: (limits as any).limit_ebooks ?? 0,
        limit_whitepapers: (limits as any).limit_whitepapers ?? 0,
        limit_linkedin: (limits as any).limit_linkedin ?? 5,
        limit_standard_content: limits.limit_standard_content ?? 5,
        limit_premium_content: limits.limit_premium_content ?? 0,
        limit_ai_credits: limits.limit_ai_credits,
        used_projects: 0,
        used_keywords_fetched: 0,
        used_keywords_explored: 0,
        used_blogs: 0,
        used_ebooks: 0,
        used_whitepapers: 0,
        used_linkedin: 0,
        used_standard_content: 0,
        used_premium_content: 0,
        used_ai_credits: 0,
      });
    }
  }

  /**
   * Fetches the complete subscription and quota status for a user.
   * Real-time counts are computed directly from DB tables for accuracy.
   */
  static async getUserQuotaStatus(userId: string): Promise<UserQuotaStatus> {
    const db = getSupabaseAdmin();

    // Ensure records are present first
    await this.ensureUserRecords(userId);

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

    // Compute real-time counts from DB
    const { count: actualProjectsCount } = await db
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const { data: userProjects } = await db
      .from("projects")
      .select("id")
      .eq("user_id", userId);

    const projectIds = (userProjects ?? []).map((p) => p.id);

    // Per-content-type counts
    let blogCount = 0;
    let ebookCount = 0;
    let whitepaperCount = 0;
    let linkedinCount = 0;
    let kwCount = 0;

    if (projectIds.length > 0) {
      const [blogRes, ebookRes, wpRes, liRes, kwRes] = await Promise.all([
        db
          .from("blogs")
          .select("id", { count: "exact", head: true })
          .in("project_id", projectIds)
          .eq("content_type", "blog"),
        db
          .from("blogs")
          .select("id", { count: "exact", head: true })
          .in("project_id", projectIds)
          .eq("content_type", "ebook"),
        db
          .from("blogs")
          .select("id", { count: "exact", head: true })
          .in("project_id", projectIds)
          .eq("content_type", "whitepaper"),
        db
          .from("blogs")
          .select("id", { count: "exact", head: true })
          .in("project_id", projectIds)
          .eq("content_type", "linkedin"),
        db
          .from("keywords")
          .select("id", { count: "exact", head: true })
          .in("project_id", projectIds),
      ]);

      blogCount = blogRes.count ?? 0;
      ebookCount = ebookRes.count ?? 0;
      whitepaperCount = wpRes.count ?? 0;
      linkedinCount = liRes.count ?? 0;
      kwCount = kwRes.count ?? 0;
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

    // Granular per-type limits (fall back to legacy if columns don't exist yet)
    const limBlogs = (quotas as any).limit_blogs ?? quotas.limit_standard_content ?? 5;
    const limEbooks = (quotas as any).limit_ebooks ?? quotas.limit_premium_content ?? 0;
    const limWhitepapers = (quotas as any).limit_whitepapers ?? 0;
    const limLinkedin = (quotas as any).limit_linkedin ?? quotas.limit_standard_content ?? 5;

    const overBlogs = (quotas as any).override_blogs ?? null;
    const overEbooks = (quotas as any).override_ebooks ?? null;
    const overWhitepapers = (quotas as any).override_whitepapers ?? null;
    const overLinkedin = (quotas as any).override_linkedin ?? null;

    const blogsItem = mapQuota(limBlogs, blogCount, overBlogs);
    const ebooksItem = mapQuota(limEbooks, ebookCount, overEbooks);
    const whitepaperItem = mapQuota(limWhitepapers, whitepaperCount, overWhitepapers);
    const linkedinItem = mapQuota(limLinkedin, linkedinCount, overLinkedin);

    return {
      planId: userProfile.plan_id,
      planName,
      subscriptionStatus: userProfile.subscription_status,
      stripeCustomerId: userProfile.stripe_customer_id,
      stripeSubscriptionId: userProfile.stripe_subscription_id,
      projects: mapQuota(quotas.limit_projects, actualProjectsCount ?? 0, quotas.override_projects),
      keywords_fetched: mapQuota(
        quotas.limit_keywords_fetched,
        kwCount,
        quotas.override_keywords_fetched
      ),
      keywords_explored: mapQuota(
        quotas.limit_keywords_explored,
        quotas.used_keywords_explored,
        quotas.override_keywords_explored
      ),
      blogs: blogsItem,
      ebooks: ebooksItem,
      whitepapers: whitepaperItem,
      linkedin: linkedinItem,
      ai_credits: mapQuota(quotas.limit_ai_credits, quotas.used_ai_credits, quotas.override_ai_credits),
      // Legacy aliases for backwards compat
      standard_content: mapQuota(
        quotas.limit_standard_content ?? limBlogs,
        blogCount + linkedinCount,
        quotas.override_standard_content
      ),
      premium_content: mapQuota(
        quotas.limit_premium_content ?? limEbooks,
        ebookCount + whitepaperCount,
        quotas.override_premium_content
      ),
    };
  }

  /**
   * Lightweight version for the client — only quota limits, no plan billing data.
   */
  static async getClientQuotaStatus(userId: string): Promise<ClientQuotaStatus> {
    const status = await this.getUserQuotaStatus(userId);
    return {
      planId: status.planId,
      planName: status.planName,
      projects: status.projects,
      keywords_fetched: status.keywords_fetched,
      keywords_explored: status.keywords_explored,
      blogs: status.blogs,
      ebooks: status.ebooks,
      whitepapers: status.whitepapers,
      linkedin: status.linkedin,
      ai_credits: status.ai_credits,
    };
  }

  /**
   * Validates if a user has sufficient quota remaining for the specified key.
   * Throws a QuotaExhaustedError if quota is exceeded.
   */
  static async checkQuota(
    userId: string,
    key: QuotaKey,
    amount: number = 1
  ): Promise<void> {
    const status = await this.getUserQuotaStatus(userId);

    // Resolve legacy keys to the new granular equivalent
    const resolvedKey = key === "standard_content" ? "blogs" :
      key === "premium_content" ? "ebooks" : key;

    const item = status[resolvedKey as keyof UserQuotaStatus] as QuotaItem | undefined;
    if (!item) throw new Error(`Unknown quota key: ${key}`);

    if (item.used + amount > item.effectiveLimit) {
      throw new QuotaExhaustedError(key, item.effectiveLimit);
    }
  }

  /**
   * Atomically checks and deducts quota.
   * For granular content types (blogs/ebooks/whitepapers/linkedin), we do NOT
   * use the RPC function (counts are computed from the blogs table in real time).
   * For keywords_explored and ai_credits we still deduct via RPC.
   */
  static async deductQuota(
    userId: string,
    key: QuotaKey,
    amount: number = 1
  ): Promise<void> {
    const db = getSupabaseAdmin();

    // Pre-flight check
    await this.checkQuota(userId, key, amount);

    // For content types tracked via real-time DB counts, no deduction needed
    // (count is computed on-the-fly from the blogs table)
    const realTimeCounted: QuotaKey[] = ["blogs", "ebooks", "whitepapers", "linkedin", "standard_content", "premium_content"];
    if (realTimeCounted.includes(key)) {
      return; // No counter to decrement — count is live from blogs table
    }

    // For keywords_explored and ai_credits, use the RPC deduction
    const rpcKey = key;
    const { data: success, error } = await db.rpc("deduct_user_quota", {
      p_user_id: userId,
      p_quota_key: rpcKey,
      p_amount: amount,
    });

    if (error) {
      throw new Error(`Quota deduction transaction failed: ${error.message}`);
    }

    if (!success) {
      const status = await this.getUserQuotaStatus(userId);
      const item = status[key as keyof UserQuotaStatus] as QuotaItem | undefined;
      throw new QuotaExhaustedError(key, item?.effectiveLimit ?? 0);
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

    await this.ensureUserRecords(userId);

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

    const { data: plan, error: planErr } = await db
      .from("subscription_plans")
      .select("*")
      .eq("id", planId)
      .single();

    if (planErr || !plan) {
      throw new Error(`Failed to fetch limits for plan ${planId}`);
    }

    const newQuotas: Record<string, any> = {
      user_id: userId,
      limit_projects: plan.limit_projects,
      limit_keywords_fetched: plan.limit_keywords_fetched,
      limit_keywords_explored: plan.limit_keywords_explored,
      limit_standard_content: plan.limit_standard_content,
      limit_premium_content: plan.limit_premium_content,
      limit_blogs: (plan as any).limit_blogs ?? plan.limit_standard_content ?? 5,
      limit_ebooks: (plan as any).limit_ebooks ?? plan.limit_premium_content ?? 0,
      limit_whitepapers: (plan as any).limit_whitepapers ?? 0,
      limit_linkedin: (plan as any).limit_linkedin ?? plan.limit_standard_content ?? 5,
      limit_ai_credits: plan.limit_ai_credits,
      updated_at: new Date().toISOString(),
    };

    // On active subscription, replenish usage counters
    if (status === "active") {
      newQuotas.used_keywords_fetched = 0;
      newQuotas.used_keywords_explored = 0;
      newQuotas.used_standard_content = 0;
      newQuotas.used_premium_content = 0;
      newQuotas.used_ai_credits = 0;
      // Note: used_blogs/ebooks/whitepapers/linkedin are computed from blogs table — no reset needed
    }

    const { error: quotaErr } = await db.from("user_quotas").upsert(newQuotas);

    if (quotaErr) {
      throw new Error(`Failed to synchronize user limits for ${userId}: ${quotaErr.message}`);
    }
  }
}
