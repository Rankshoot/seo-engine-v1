"use client";

import { useTransition } from "react";
import { createCheckoutSession, createPortalSession } from "@/app/actions/stripe-actions";
import { toast } from "react-hot-toast";
import { useRouter } from "next/navigation";

interface Plan {
  id: string;
  name: string;
  monthly_price: number;
  stripe_price_id: string | null;
  limit_projects: number;
  limit_keywords_fetched: number;
  limit_keywords_explored: number;
  limit_standard_content: number;
  limit_premium_content: number;
  limit_ai_credits: number;
}

interface PricingCardsProps {
  plans: Plan[];
  userActivePlanId: string;
  isUserSubscribed: boolean;
  isLoggedIn: boolean;
}

export function PricingCards({
  plans,
  userActivePlanId,
  isUserSubscribed,
  isLoggedIn,
}: PricingCardsProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleAction = (planId: string) => {
    if (!isLoggedIn) {
      toast.error("Please sign in to choose a plan.");
      router.push("/sign-in?redirect_url=/pricing");
      return;
    }

    startTransition(async () => {
      try {
        // If they click on their already-active subscription plan, redirect to the customer portal
        if (isUserSubscribed && planId === userActivePlanId) {
          const { url } = await createPortalSession();
          window.location.href = url;
          return;
        }

        // Otherwise, start checkout flow
        const { url } = await createCheckoutSession(planId);
        window.location.href = url;
      } catch (err: any) {
        toast.error(err.message || "Something went wrong. Please try again.");
      }
    });
  };

  const getPlanDescription = (id: string) => {
    switch (id) {
      case "free":
        return "Ideal for exploring the interface and auditing your first project.";
      case "pro":
        return "Best for active SEO writers and builders scaling their organic traffic.";
      case "enterprise":
        return "For agencies and large scale publishers requiring advanced pipelines.";
      default:
        return "Configure your resources dynamically.";
    }
  };

  return (
    <div className="space-y-20 animate-fade-in delay-200">
      {/* Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((p) => {
          const isPro = p.id === "pro";
          const isCurrentPlan = p.id === userActivePlanId;
          const isFreePlan = p.id === "free";
          
          return (
            <div
              key={p.id}
              className={`relative rounded-[24px] p-8 bg-surface-secondary border transition-all duration-[300ms] flex flex-col justify-between hover:scale-[1.02] hover:-translate-y-1 ${
                isPro
                  ? "border-brand-violet/50 shadow-glow-sm shadow-brand-violet/10 ring-1 ring-brand-violet/20 md:scale-[1.04] md:hover:scale-[1.06]"
                  : "border-border-subtle hover:border-border-default shadow-xs"
              }`}
            >
              {/* Highlight Badge */}
              {isPro && (
                <span className="absolute top-[-14px] left-[50%] translate-x-[-50%] bg-gradient-to-r from-brand-violet to-brand-violet-soft text-white text-[11px] font-bold uppercase tracking-widest px-3 py-1 rounded-[20px] shadow-sm">
                  Most Popular
                </span>
              )}

              {/* Title & Price */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-[20px] font-bold font-display text-text-primary">
                    {p.name}
                  </h3>
                  {isCurrentPlan && (
                    <span className="text-[11px] bg-brand-action/10 text-brand-action border border-brand-action/20 font-semibold px-2 py-0.5 rounded-pill uppercase">
                      Current
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-tertiary leading-relaxed">
                  {getPlanDescription(p.id)}
                </p>
                <div className="flex items-baseline gap-1 pt-2">
                  <span className="text-4xl font-extrabold font-display text-text-primary">
                    ${p.monthly_price}
                  </span>
                  <span className="text-sm text-text-tertiary">/month</span>
                </div>
              </div>

              {/* Feature Limits List */}
              <ul className="space-y-4 my-8 border-t border-border-subtle pt-6 flex-1 text-sm text-text-secondary">
                <li className="flex items-center gap-3">
                  <span className="text-brand-action">✓</span>
                  <span>Up to <strong className="text-text-primary">{p.limit_projects}</strong> active {p.limit_projects === 1 ? 'project' : 'projects'}</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-brand-action">✓</span>
                  <span><strong className="text-text-primary">{p.limit_keywords_fetched}</strong> SEO keywords /month</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-brand-action">✓</span>
                  <span><strong className="text-text-primary">{p.limit_keywords_explored}</strong> AI explored keywords</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-brand-action">✓</span>
                  <span><strong className="text-text-primary">{p.limit_ai_credits}</strong> AI helper credits</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="text-brand-action">✓</span>
                  <span><strong className="text-text-primary">{p.limit_standard_content}</strong> blog articles /month</span>
                </li>
                {p.limit_premium_content > 0 ? (
                  <li className="flex items-center gap-3">
                    <span className="text-brand-action">✓</span>
                    <span><strong className="text-text-primary">{p.limit_premium_content}</strong> premium books /month</span>
                  </li>
                ) : (
                  <li className="flex items-center gap-3 text-text-tertiary line-through">
                    <span>×</span>
                    <span>Premium content formats</span>
                  </li>
                )}
              </ul>

              {/* Action Button */}
              <div>
                {isCurrentPlan ? (
                  <button
                    onClick={() => handleAction(p.id)}
                    disabled={isPending || isFreePlan}
                    className={`w-full py-3.5 rounded-[12px] font-semibold text-sm transition-all border shadow-sm cursor-pointer ${
                      isFreePlan
                        ? "bg-surface-elevated text-text-tertiary border-border-subtle cursor-not-allowed"
                        : "bg-surface-elevated hover:bg-surface-hover text-brand-action border-border-subtle"
                    }`}
                  >
                    {isPending ? "Loading..." : isFreePlan ? "Active Free Plan" : "Manage Billing"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleAction(p.id)}
                    disabled={isPending || (isFreePlan && isUserSubscribed)}
                    className={`w-full py-3.5 rounded-[12px] font-semibold text-sm transition-all shadow-sm cursor-pointer active:brightness-95 disabled:opacity-50 ${
                      isPro
                        ? "bg-brand-action hover:bg-brand-action-hover text-white"
                        : isFreePlan && isUserSubscribed
                        ? "bg-surface-elevated text-text-tertiary border border-border-subtle cursor-not-allowed"
                        : "bg-text-primary hover:opacity-90 text-surface-primary"
                    }`}
                  >
                    {isPending ? "Connecting..." : isFreePlan ? "Downgrade" : "Subscribe"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* FAQ Section */}
      <div className="border-t border-border-subtle pt-16 max-w-3xl mx-auto space-y-8">
        <h3 className="text-2xl font-bold font-display text-text-primary text-center">
          Frequently Asked Questions
        </h3>
        <div className="grid grid-cols-1 gap-6 text-sm text-text-secondary">
          <div className="space-y-2 p-4 bg-surface-secondary rounded-[16px] border border-border-subtle">
            <h4 className="font-bold text-text-primary">How do AI credits work?</h4>
            <p>Every time you request article outlines, brief expansions, or quick copy reviews, 1 credit is deducted. Token sizes are tracked server-side and never forwarded to your bill.</p>
          </div>
          <div className="space-y-2 p-4 bg-surface-secondary rounded-[16px] border border-border-subtle">
            <h4 className="font-bold text-text-primary">Can I modify my limits later?</h4>
            <p>Yes. If you have unique business requirements, our admins can override any resource thresholds directly on your account without interrupting your active billing cycle.</p>
          </div>
          <div className="space-y-2 p-4 bg-surface-secondary rounded-[16px] border border-border-subtle">
            <h4 className="font-bold text-text-primary">What happens when I downgrade?</h4>
            <p>When canceling a subscription, your plan limits downgrade automatically to our Free Tier at the end of your billing cycle. No data will be lost, but operations exceeding new limits will be paused.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
