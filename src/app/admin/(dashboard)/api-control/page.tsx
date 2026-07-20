import { getApiControlSettings } from "@/app/actions/admin-api-control-actions";
import { ApiControlEditor } from "./ApiControlEditor";
import { ProviderSourceCard } from "./ProviderSourceCard";

export default async function AdminApiControlPage() {
  const plans = await getApiControlSettings();

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-[28px] font-bold font-display text-text-primary tracking-tight">
          API Control
        </h1>
        <p className="text-[14px] text-text-tertiary mt-1">
          Manage Ahrefs API access for each subscription plan. Toggle features on/off per plan to control costs and differentiate plan tiers.
        </p>
      </div>
      <ProviderSourceCard />
      <ApiControlEditor initialPlans={plans} />
    </div>
  );
}
