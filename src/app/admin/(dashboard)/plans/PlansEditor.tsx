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
  // Granular per-content-type limits
  limit_blogs: number;
  limit_ebooks: number;
  limit_whitepapers: number;
  limit_linkedin: number;
  // Legacy (kept for display compatibility)
  limit_standard_content: number;
  limit_premium_content: number;
  limit_ai_credits: number;
}

interface PlansEditorProps {
  initialPlans: Plan[];
}

const EMPTY_NEW_PLAN: PlanUpdateInput = {
  name: "",
  monthly_price: 0,
  stripe_price_id: "",
  limit_projects: 1,
  limit_keywords_fetched: 50,
  limit_keywords_explored: 10,
  limit_blogs: 5,
  limit_ebooks: 0,
  limit_whitepapers: 0,
  limit_linkedin: 5,
  limit_standard_content: 5,
  limit_premium_content: 0,
  limit_ai_credits: 10,
};

function SectionHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="md:col-span-2 border-t border-border-subtle pt-5 mt-1">
      <div className="flex items-center gap-2">
        <h4 className="text-[10.5px] font-bold text-text-tertiary uppercase tracking-[0.1em]">{label}</h4>
        {hint && <span className="text-[10px] text-text-tertiary/60">{hint}</span>}
      </div>
    </div>
  );
}

function LimitField({
  label,
  value,
  hint,
  onChange,
}: {
  label: string;
  value: string | number;
  hint?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-semibold text-text-secondary">{label}</label>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field w-full"
      />
      {hint && <span className="text-[10px] text-text-tertiary">{hint}</span>}
    </div>
  );
}

function QuotaForm({
  data,
  onChange,
}: {
  data: Partial<Plan>;
  onChange: (field: keyof PlanUpdateInput, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <SectionHeader label="Projects & Keywords" />

      <LimitField
        label="Projects limit"
        value={data.limit_projects ?? 1}
        onChange={(v) => onChange("limit_projects", v)}
      />
      <LimitField
        label="Keywords fetched (SEO API)"
        value={data.limit_keywords_fetched ?? 50}
        hint="DataForSEO / Ahrefs keyword pulls"
        onChange={(v) => onChange("limit_keywords_fetched", v)}
      />
      <LimitField
        label="Keywords explored (AI)"
        value={data.limit_keywords_explored ?? 10}
        hint="AI-powered keyword analysis runs"
        onChange={(v) => onChange("limit_keywords_explored", v)}
      />

      <SectionHeader label="Content Generation" hint="Per content type, per billing cycle" />

      <LimitField
        label="Blog articles"
        value={data.limit_blogs ?? 5}
        onChange={(v) => onChange("limit_blogs", v)}
      />
      <LimitField
        label="LinkedIn posts"
        value={data.limit_linkedin ?? 5}
        onChange={(v) => onChange("limit_linkedin", v)}
      />
      <LimitField
        label="Ebooks"
        value={data.limit_ebooks ?? 0}
        hint="0 = not included in this plan"
        onChange={(v) => onChange("limit_ebooks", v)}
      />
      <LimitField
        label="Whitepapers"
        value={data.limit_whitepapers ?? 0}
        hint="0 = not included in this plan"
        onChange={(v) => onChange("limit_whitepapers", v)}
      />

      <SectionHeader label="AI Assistant" />

      <LimitField
        label="AI helper credits"
        value={data.limit_ai_credits ?? 10}
        hint="Ask AI, topic suggest, AI edit"
        onChange={(v) => onChange("limit_ai_credits", v)}
      />
    </div>
  );
}

export function PlansEditor({ initialPlans }: PlansEditorProps) {
  const [plans, setPlans] = useState<Plan[]>(
    initialPlans.map((p) => ({
      ...p,
      stripe_price_id: p.stripe_price_id || "",
      limit_blogs: (p as any).limit_blogs ?? p.limit_standard_content ?? 5,
      limit_ebooks: (p as any).limit_ebooks ?? p.limit_premium_content ?? 0,
      limit_whitepapers: (p as any).limit_whitepapers ?? 0,
      limit_linkedin: (p as any).limit_linkedin ?? p.limit_standard_content ?? 5,
    }))
  );

  const [activePlanId, setActivePlanId] = useState<string>(
    initialPlans[0]?.id || "free"
  );
  const [isCreating, setIsCreating] = useState(false);
  const [newPlanId, setNewPlanId] = useState("");
  const [newPlan, setNewPlan] = useState<PlanUpdateInput>({ ...EMPTY_NEW_PLAN });

  const [isPending, startTransition] = useTransition();

  const activePlan = plans.find((p) => p.id === activePlanId);

  const handleInputChange = (field: keyof PlanUpdateInput, value: string) => {
    setPlans((prevPlans) =>
      prevPlans.map((p) => {
        if (p.id !== activePlanId) return p;
        const isNumeric = field !== "name" && field !== "stripe_price_id" && field !== "monthly_price";
        let parsed: string | number = value;
        if (isNumeric) {
          parsed = value === "" ? "" : isNaN(Number(value)) ? 0 : Number(value);
        }
        return { ...p, [field]: parsed };
      })
    );
  };

  const handleNewPlanChange = (field: keyof PlanUpdateInput, value: string) => {
    setNewPlan((prev) => {
      const isNumeric = field !== "name" && field !== "stripe_price_id" && field !== "monthly_price";
      const parsed = isNumeric ? (value === "" ? 0 : Number(value) || 0) : value;
      return { ...prev, [field]: parsed };
    });
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
          limit_blogs: Number(activePlan.limit_blogs) || 0,
          limit_ebooks: Number(activePlan.limit_ebooks) || 0,
          limit_whitepapers: Number(activePlan.limit_whitepapers) || 0,
          limit_linkedin: Number(activePlan.limit_linkedin) || 0,
          limit_standard_content: (Number(activePlan.limit_blogs) || 0) + (Number(activePlan.limit_linkedin) || 0),
          limit_premium_content: (Number(activePlan.limit_ebooks) || 0) + (Number(activePlan.limit_whitepapers) || 0),
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
    if (!formattedId) { toast.error("Plan ID is required."); return; }
    if (!newPlan.name.trim()) { toast.error("Plan name is required."); return; }

    startTransition(async () => {
      try {
        const res = await createSubscriptionPlan(formattedId, {
          ...newPlan,
          stripe_price_id: newPlan.stripe_price_id || null,
          limit_standard_content: newPlan.limit_blogs + newPlan.limit_linkedin,
          limit_premium_content: newPlan.limit_ebooks + newPlan.limit_whitepapers,
        });
        if (res.success) {
          toast.success(`Plan "${newPlan.name}" created!`);
          const createdPlan: Plan = {
            id: formattedId,
            ...newPlan,
            stripe_price_id: newPlan.stripe_price_id || "",
          };
          setPlans((prev) => [...prev, createdPlan]);
          setActivePlanId(formattedId);
          setIsCreating(false);
          setNewPlanId("");
          setNewPlan({ ...EMPTY_NEW_PLAN });
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
          <span className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary">
            Select Plan
          </span>
          <button
            onClick={() => { setIsCreating(true); setActivePlanId(""); }}
            className="text-[11px] text-brand-action hover:underline font-semibold cursor-pointer"
          >
            + Add New
          </button>
        </div>
        {plans.map((p) => {
          const isActive = p.id === activePlanId && !isCreating;
          return (
            <button
              key={p.id}
              onClick={() => { setIsCreating(false); setActivePlanId(p.id); }}
              className={`w-full text-left px-4 py-3 rounded-xl text-[13px] font-semibold transition-all border cursor-pointer ${
                isActive
                  ? "bg-surface-elevated text-brand-action border-border-default shadow-sm"
                  : "text-text-secondary border-transparent hover:bg-surface-hover hover:text-text-primary"
              }`}
            >
              <div className="flex justify-between items-center">
                <span>{p.name}</span>
                <span className="text-[11px] text-text-tertiary font-normal">
                  ${p.monthly_price}/mo
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Settings Panel Right */}
      {isCreating ? (
        <div className="lg:col-span-3 bg-surface-secondary border border-border-subtle rounded-2xl p-6 lg:p-8 shadow-sm flex flex-col gap-6">
          <div className="border-b border-border-subtle pb-4 flex justify-between items-start">
            <div>
              <h3 className="text-[17px] font-bold text-text-primary">Create New Plan</h3>
              <p className="text-[12px] text-text-tertiary mt-1">Configure plan identifier, pricing, and resource limits.</p>
            </div>
            <button
              onClick={() => { setIsCreating(false); if (plans.length > 0) setActivePlanId(plans[0].id); }}
              className="text-[11px] text-text-tertiary hover:text-text-primary transition-colors border border-border-subtle rounded-md px-2.5 py-1 cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-[11px] font-semibold text-text-secondary">Plan ID <span className="text-text-tertiary font-normal">(lowercase, no spaces)</span></label>
              <input type="text" value={newPlanId} onChange={(e) => setNewPlanId(e.target.value)} className="input-field w-full font-mono text-xs" placeholder="hobby" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-text-secondary">Plan Name</label>
              <input type="text" value={newPlan.name} onChange={(e) => handleNewPlanChange("name", e.target.value)} className="input-field w-full" placeholder="Hobby Plan" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-text-secondary">Monthly Price (USD)</label>
              <input type="number" value={newPlan.monthly_price} onChange={(e) => handleNewPlanChange("monthly_price", e.target.value)} className="input-field w-full" placeholder="19" />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-[11px] font-semibold text-text-secondary">Stripe Price ID</label>
              <input type="text" value={newPlan.stripe_price_id || ""} onChange={(e) => handleNewPlanChange("stripe_price_id", e.target.value)} className="input-field w-full font-mono text-xs" placeholder="price_1N23..." />
            </div>
          </div>

          <QuotaForm data={newPlan} onChange={handleNewPlanChange} />

          <div className="border-t border-border-subtle pt-5 flex justify-end">
            <button
              onClick={handleCreate}
              disabled={isPending}
              className="px-6 py-2.5 rounded-xl bg-brand-action hover:bg-brand-action-hover text-white font-semibold text-[13px] transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isPending ? "Creating…" : "Create Subscription Plan"}
            </button>
          </div>
        </div>
      ) : activePlan ? (
        <div className="lg:col-span-3 bg-surface-secondary border border-border-subtle rounded-2xl p-6 lg:p-8 shadow-sm flex flex-col gap-6">
          <div className="border-b border-border-subtle pb-4">
            <h3 className="text-[17px] font-bold text-text-primary">Configuration for {activePlan.name}</h3>
            <p className="text-[12px] text-text-tertiary mt-1">Key variables stored in database. All values are strict limits.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-text-secondary">Plan Name</label>
              <input type="text" value={activePlan.name} onChange={(e) => handleInputChange("name", e.target.value)} className="input-field w-full" placeholder="Pro Plan" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-text-secondary">Monthly Price (USD)</label>
              <input type="number" value={activePlan.monthly_price} onChange={(e) => handleInputChange("monthly_price", e.target.value)} className="input-field w-full" placeholder="49" />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <label className="text-[11px] font-semibold text-text-secondary flex justify-between">
                <span>Stripe Price ID</span>
                {activePlan.id === "free" && <span className="text-text-tertiary font-normal">(Leave empty for free tier)</span>}
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
          </div>

          <QuotaForm data={activePlan} onChange={handleInputChange} />

          <div className="border-t border-border-subtle pt-5 flex justify-end">
            <button
              onClick={handleSave}
              disabled={isPending}
              className="px-6 py-2.5 rounded-xl bg-brand-action hover:bg-brand-action-hover text-white font-semibold text-[13px] transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isPending ? "Saving changes…" : "Save Plan Configuration"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
