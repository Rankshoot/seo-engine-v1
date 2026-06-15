import { currentUser } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { PricingCards } from "./PricingCards";

// Render dynamically at request time to fetch live plan features and active user subscription status
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const db = getSupabaseAdmin();

  // 1. Fetch plans
  const { data: plans, error } = await db
    .from("subscription_plans")
    .select("*")
    .order("monthly_price", { ascending: true });

  if (error || !plans) {
    throw new Error("Could not load pricing plans.");
  }

  // 2. Fetch logged-in user subscription state
  const user = await currentUser();
  let userActivePlanId = "free";
  let isUserSubscribed = false;

  if (user) {
    const { data: dbUser } = await db
      .from("users")
      .select("plan_id, subscription_status")
      .eq("id", user.id)
      .maybeSingle();

    if (dbUser) {
      userActivePlanId = dbUser.plan_id || "free";
      isUserSubscribed = dbUser.subscription_status === "active";
    }
  }

  return (
    <div className="min-h-screen bg-surface-primary py-24 px-6 relative overflow-hidden">
      {/* Background ambient radial glow */}
      <div className="absolute top-[-20%] left-[20%] w-[600px] h-[600px] rounded-full bg-brand-violet/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] rounded-full bg-brand-aqua/5 blur-[120px] pointer-events-none" />

      <div className="max-w-[1200px] mx-auto space-y-16 relative z-10">
        <div className="text-center space-y-4 max-w-2xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-extrabold font-display tracking-tight text-text-primary animate-fade-in-up">
            Simple, Transparent <span className="gradient-text">Pricing</span>
          </h1>
          <p className="text-text-secondary text-[16px] leading-relaxed max-w-lg mx-auto animate-fade-in delay-100">
            Select the plan that fits your growth. Manage competitor benchmarks, keywords exploration, and AI copywriting with predictable credits.
          </p>
        </div>

        <PricingCards
          plans={plans}
          userActivePlanId={userActivePlanId}
          isUserSubscribed={isUserSubscribed}
          isLoggedIn={!!user}
        />
      </div>
    </div>
  );
}
