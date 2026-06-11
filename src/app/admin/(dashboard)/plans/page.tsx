import { getSubscriptionPlans } from "@/app/actions/admin-plans-actions";
import { PlansEditor } from "./PlansEditor";

export default async function AdminPlansPage() {
  const plans = await getSubscriptionPlans();

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-[28px] font-bold font-display text-text-primary tracking-tight">
          Subscription Plans
        </h1>
        <p className="text-[14px] text-text-tertiary mt-1">
          Configure resource limits, monthly prices, and Stripe Price IDs for customer subscription plans.
        </p>
      </div>
      <PlansEditor initialPlans={plans} />
    </div>
  );
}
