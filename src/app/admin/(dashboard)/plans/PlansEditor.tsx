"use client";

import { useState, useTransition } from "react";
import { updateSubscriptionPlan, createSubscriptionPlan, type PlanUpdateInput } from "@/app/actions/admin-plans-actions";
import { toast } from "react-hot-toast";

interface Plan {
  id: string;
  name: string;
  monthly_price: number | string;
  stripe_price_id: string | null;
  limit_projects: number;
  limit_keywords_fetched: number;
  limit_keywords_explored: number;
  limit_standard_content: number;
  limit_premium_content: number;
  limit_ai_credits: number;
}

interface PlansEditorProps {
  initialPlans: Plan[];
}

export function PlansEditor({ initialPlans }: PlansEditorProps) {
  const [plans, setPlans] = useState<Plan[]>(
    initialPlans.map((p) => ({
      ...p,
      stripe_price_id: p.stripe_price_id || "",
    }))
  );
  
  const [activePlanId, setActivePlanId] = useState<string>(
    initialPlans[0]?.id || "free"
  );
  const [isCreating, setIsCreating] = useState(false);
  const [newPlanId, setNewPlanId] = useState("");
  const [newPlan, setNewPlan] = useState<PlanUpdateInput>({
    name: "",
    monthly_price: 0,
    stripe_price_id: "",
    limit_projects: 1,
    limit_keywords_fetched: 50,
    limit_keywords_explored: 10,
    limit_standard_content: 2,
    limit_premium_content: 0,
    limit_ai_credits: 10,
  });

  const [isPending, startTransition] = useTransition();

  const activePlan = plans.find((p) => p.id === activePlanId);

  const handleInputChange = (field: keyof PlanUpdateInput, value: string | number) => {
    setPlans((prevPlans) =>
      prevPlans.map((p) => {
        if (p.id !== activePlanId) return p;
        
        let parsedValue = value;
        if (field !== "name" && field !== "stripe_price_id" && field !== "monthly_price") {
          if (value === "") {
            parsedValue = "";
          } else {
            parsedValue = Number(value);
            if (isNaN(parsedValue)) parsedValue = 0;
          }
        }

        return {
          ...p,
          [field]: parsedValue,
        };
      })
    );
  };

  const handleNewPlanChange = (field: keyof PlanUpdateInput, value: string | number) => {
    setNewPlan((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = () => {
    if (!activePlan) return;

    startTransition(async () => {
      try {
        const updateData: PlanUpdateInput = {
          name: activePlan.name,
          monthly_price: Number(activePlan.monthly_price) || 0,
          stripe_price_id: activePlan.stripe_price_id || null,
          limit_projects: Number(activePlan.limit_projects) || 0,
          limit_keywords_fetched: Number(activePlan.limit_keywords_fetched) || 0,
          limit_keywords_explored: Number(activePlan.limit_keywords_explored) || 0,
          limit_standard_content: Number(activePlan.limit_standard_content) || 0,
          limit_premium_content: Number(activePlan.limit_premium_content) || 0,
          limit_ai_credits: Number(activePlan.limit_ai_credits) || 0,
        };

        const res = await updateSubscriptionPlan(activePlan.id, updateData);
        if (res.success) {
          toast.success(`Plan "${activePlan.name}" updated successfully!`);
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to save plan limits.");
      }
    });
  };

  const handleCreate = () => {
    const formattedId = newPlanId.trim().toLowerCase();
    if (!formattedId) {
      toast.error("Plan ID is required.");
      return;
    }
    if (!newPlan.name.trim()) {
      toast.error("Plan name is required.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await createSubscriptionPlan(formattedId, {
          ...newPlan,
          stripe_price_id: newPlan.stripe_price_id || null,
        });
        if (res.success) {
          toast.success(`Plan "${newPlan.name}" created successfully!`);
          
          const createdPlan: Plan = {
            id: formattedId,
            name: newPlan.name,
            monthly_price: newPlan.monthly_price,
            stripe_price_id: newPlan.stripe_price_id || "",
            limit_projects: newPlan.limit_projects,
            limit_keywords_fetched: newPlan.limit_keywords_fetched,
            limit_keywords_explored: newPlan.limit_keywords_explored,
            limit_standard_content: newPlan.limit_standard_content,
            limit_premium_content: newPlan.limit_premium_content,
            limit_ai_credits: newPlan.limit_ai_credits,
          };
          
          setPlans((prev) => [...prev, createdPlan]);
          setActivePlanId(formattedId);
          setIsCreating(false);
          
          // Reset fields
          setNewPlanId("");
          setNewPlan({
            name: "",
            monthly_price: 0,
            stripe_price_id: "",
            limit_projects: 1,
            limit_keywords_fetched: 50,
            limit_keywords_explored: 10,
            limit_standard_content: 2,
            limit_premium_content: 0,
            limit_ai_credits: 10,
          });
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to create new plan.");
      }
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      {/* Plan Tabs Left */}
      <div className="lg:col-span-1 flex flex-col gap-2">
        <div className="flex justify-between items-center px-2 mb-2">
          <span className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary">
            Select Plan
          </span>
          <button
            onClick={() => {
              setIsCreating(true);
              setActivePlanId("");
            }}
            className="text-xs text-brand-action hover:underline font-semibold cursor-pointer"
          >
            + Add New
          </button>
        </div>
        {plans.map((p) => {
          const isActive = p.id === activePlanId && !isCreating;
          return (
            <button
              key={p.id}
              onClick={() => {
                setIsCreating(false);
                setActivePlanId(p.id);
              }}
              className={`w-full text-left px-4 py-3.5 rounded-[12px] text-sm font-semibold transition-all border cursor-pointer ${
                isActive
                  ? "bg-surface-elevated text-brand-action border-border-default shadow-sm font-bold"
                  : "text-text-secondary border-transparent hover:bg-surface-hover hover:text-text-primary"
              }`}
            >
              <div className="flex justify-between items-center">
                <span>{p.name}</span>
                <span className="text-xs text-text-tertiary font-normal">
                  ${p.monthly_price}/mo
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Settings Grid Right */}
      {isCreating ? (
        <div className="lg:col-span-3 bg-surface-secondary border border-border-subtle rounded-[16px] p-6 lg:p-8 shadow-sm flex flex-col gap-6">
          <div className="border-b border-border-subtle pb-4 flex justify-between items-center">
            <div>
              <h3 className="text-[18px] font-bold font-display text-text-primary">
                Create New Plan
              </h3>
              <p className="text-xs text-text-tertiary mt-1">
                Configure plan identifiers, prices, and resource limits.
              </p>
            </div>
            <button
              onClick={() => {
                setIsCreating(false);
                if (plans.length > 0) {
                  setActivePlanId(plans[0].id);
                }
              }}
              className="text-xs text-text-tertiary hover:text-text-primary transition-colors border border-border-subtle rounded-md px-2.5 py-1 cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-text-secondary">Plan ID (lowercase, no spaces, e.g. "hobby")</label>
              <input
                type="text"
                value={newPlanId}
                onChange={(e) => setNewPlanId(e.target.value)}
                className="input-field w-full font-mono text-xs"
                placeholder="hobby"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Plan Name</label>
              <input
                type="text"
                value={newPlan.name}
                onChange={(e) => handleNewPlanChange("name", e.target.value)}
                className="input-field w-full"
                placeholder="Hobby Plan"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Monthly Price (USD)</label>
              <input
                type="number"
                value={newPlan.monthly_price}
                onChange={(e) => handleNewPlanChange("monthly_price", Number(e.target.value) || 0)}
                className="input-field w-full"
                placeholder="19"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-text-secondary">Stripe Price ID</label>
              <input
                type="text"
                value={newPlan.stripe_price_id || ""}
                onChange={(e) => handleNewPlanChange("stripe_price_id", e.target.value)}
                className="input-field w-full font-mono text-xs"
                placeholder="price_1N23..."
              />
            </div>

            {/* Quota Limits */}
            <div className="md:col-span-2 border-t border-border-subtle pt-6">
              <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-4">
                Plan Resource Quotas
              </h4>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Limit Projects</label>
              <input
                type="number"
                value={newPlan.limit_projects}
                onChange={(e) => handleNewPlanChange("limit_projects", Number(e.target.value) || 0)}
                className="input-field w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Limit Keywords Fetched (SEO)</label>
              <input
                type="number"
                value={newPlan.limit_keywords_fetched}
                onChange={(e) => handleNewPlanChange("limit_keywords_fetched", Number(e.target.value) || 0)}
                className="input-field w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Limit Keywords Explored (AI)</label>
              <input
                type="number"
                value={newPlan.limit_keywords_explored}
                onChange={(e) => handleNewPlanChange("limit_keywords_explored", Number(e.target.value) || 0)}
                className="input-field w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Limit AI Helper Credits</label>
              <input
                type="number"
                value={newPlan.limit_ai_credits}
                onChange={(e) => handleNewPlanChange("limit_ai_credits", Number(e.target.value) || 0)}
                className="input-field w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Limit Standard Content (Blogs)</label>
              <input
                type="number"
                value={newPlan.limit_standard_content}
                onChange={(e) => handleNewPlanChange("limit_standard_content", Number(e.target.value) || 0)}
                className="input-field w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Limit Premium Content (Ebooks, Whitepapers)</label>
              <input
                type="number"
                value={newPlan.limit_premium_content}
                onChange={(e) => handleNewPlanChange("limit_premium_content", Number(e.target.value) || 0)}
                className="input-field w-full"
              />
            </div>
          </div>

          <div className="border-t border-border-subtle pt-6 flex justify-end">
            <button
              onClick={handleCreate}
              disabled={isPending}
              className="px-6 py-3 rounded-[12px] bg-brand-action hover:bg-brand-action-hover text-white font-semibold text-sm transition-all shadow-sm active:brightness-95 disabled:opacity-50 cursor-pointer"
            >
              {isPending ? "Creating plan..." : "Create Subscription Plan"}
            </button>
          </div>
        </div>
      ) : activePlan ? (
        <div className="lg:col-span-3 bg-surface-secondary border border-border-subtle rounded-[16px] p-6 lg:p-8 shadow-sm flex flex-col gap-6">
          <div className="border-b border-border-subtle pb-4">
            <h3 className="text-[18px] font-bold font-display text-text-primary">
              Configuration for {activePlan.name}
            </h3>
            <p className="text-xs text-text-tertiary mt-1">
              Key variables stored in database. All values are strict limits.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Plan Name</label>
              <input
                type="text"
                value={activePlan.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                className="input-field w-full"
                placeholder="Pro Plan"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Monthly Price (USD)</label>
              <input
                type="number"
                value={activePlan.monthly_price}
                onChange={(e) => handleInputChange("monthly_price", e.target.value)}
                className="input-field w-full"
                placeholder="49"
              />
            </div>

            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-text-secondary flex justify-between">
                <span>Stripe Price ID</span>
                {activePlan.id === "free" && (
                  <span className="text-text-tertiary font-normal">(Leave empty for free tier)</span>
                )}
              </label>
              <input
                type="text"
                value={activePlan.stripe_price_id || ""}
                onChange={(e) => handleInputChange("stripe_price_id", e.target.value)}
                className="input-field w-full font-mono text-xs"
                placeholder="price_1N23..."
                disabled={activePlan.id === "free"}
              />
            </div>

            {/* Quota Limits */}
            <div className="md:col-span-2 border-t border-border-subtle pt-6">
              <h4 className="text-sm font-bold text-text-primary uppercase tracking-wider mb-4">
                Plan Resource Quotas
              </h4>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Limit Projects</label>
              <input
                type="number"
                value={activePlan.limit_projects}
                onChange={(e) => handleInputChange("limit_projects", e.target.value)}
                className="input-field w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Limit Keywords Fetched (SEO)</label>
              <input
                type="number"
                value={activePlan.limit_keywords_fetched}
                onChange={(e) => handleInputChange("limit_keywords_fetched", e.target.value)}
                className="input-field w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Limit Keywords Explored (AI)</label>
              <input
                type="number"
                value={activePlan.limit_keywords_explored}
                onChange={(e) => handleInputChange("limit_keywords_explored", e.target.value)}
                className="input-field w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Limit AI Helper Credits</label>
              <input
                type="number"
                value={activePlan.limit_ai_credits}
                onChange={(e) => handleInputChange("limit_ai_credits", e.target.value)}
                className="input-field w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Limit Standard Content (Blogs)</label>
              <input
                type="number"
                value={activePlan.limit_standard_content}
                onChange={(e) => handleInputChange("limit_standard_content", e.target.value)}
                className="input-field w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-text-secondary">Limit Premium Content (Ebooks, Whitepapers)</label>
              <input
                type="number"
                value={activePlan.limit_premium_content}
                onChange={(e) => handleInputChange("limit_premium_content", e.target.value)}
                className="input-field w-full"
              />
            </div>
          </div>

          <div className="border-t border-border-subtle pt-6 flex justify-end">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="px-6 py-3 rounded-[12px] bg-brand-action hover:bg-brand-action-hover text-white font-semibold text-sm transition-all shadow-sm active:brightness-95 disabled:opacity-50 cursor-pointer"
            >
              {isPending ? "Saving changes..." : "Save Plan Configuration"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
