"use client";

import { useState, useTransition } from "react";
import { updateBulkApiControl, type PlanWithApiControl } from "@/app/actions/admin-api-control-actions";
import { toast } from "react-hot-toast";

interface ApiControlEditorProps {
  initialPlans: PlanWithApiControl[];
}

const API_DEFINITIONS = [
  {
    key: "enable_ahrefs_matching_terms" as const,
    label: "Keyword Discovery (Load More)",
    description: "Allows users to load more keywords using Ahrefs matching-terms API when clicking 'Load more' in Organic Keywords tab.",
    defaultValue: true,
  },
  {
    key: "enable_ahrefs_organic_competitors" as const,
    label: "Competitor Benchmark",
    description: "Allows users to run competitor benchmarks using Ahrefs organic-competitors API when clicking 'Run Benchmark' in Competitors tab.",
    defaultValue: true,
  },
  {
    key: "enable_ahrefs_blog_headings" as const,
    label: "Blog Headings Keywords",
    description: "Fetches secondary keywords for blog headings (limit=7) from Ahrefs when generating blog content. These keywords are included in H2/H3 sections.",
    defaultValue: false,
  },
  {
    key: "enable_ahrefs_blog_faqs" as const,
    label: "Blog FAQ Keywords",
    description: "Fetches question-based keywords for blog FAQs (limit=5) from Ahrefs when generating blog content. These populate the FAQ section.",
    defaultValue: false,
  },
];

export function ApiControlEditor({ initialPlans }: ApiControlEditorProps) {
  const [plans, setPlans] = useState<PlanWithApiControl[]>(initialPlans);
  const [hasChanges, setHasChanges] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleToggle = (planId: string, apiKey: keyof PlanWithApiControl["api_settings"]) => {
    setPlans((prev) =>
      prev.map((p) => {
        if (p.id !== planId) return p;
        return {
          ...p,
          api_settings: {
            ...p.api_settings,
            [apiKey]: !p.api_settings[apiKey],
          },
        };
      })
    );
    setHasChanges(true);
  };

  const handleSave = () => {
    startTransition(async () => {
      try {
        const updates = plans.map((p) => ({
          planId: p.id,
          settings: p.api_settings,
        }));

        const res = await updateBulkApiControl(updates);
        if (res.success) {
          toast.success(`API control settings updated for ${res.updated} plans!`);
          setHasChanges(false);
        }
      } catch (err: any) {
        toast.error(err.message || "Failed to save API control settings.");
      }
    });
  };

  const handleReset = () => {
    setPlans(initialPlans);
    setHasChanges(false);
    toast.success("Reset to saved settings");
  };

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="text-[14px] text-text-secondary">
          Configure which Ahrefs APIs are available to users on each plan.
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleReset}
            disabled={!hasChanges || isPending}
            className="px-4 py-2 rounded-[8px] text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover disabled:opacity-50 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={!hasChanges || isPending}
            className="px-4 py-2 rounded-[8px] text-[14px] font-medium bg-brand-action text-white hover:bg-brand-action/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>

      {/* API Control Table */}
      <div className="border border-border-subtle rounded-[12px] overflow-hidden bg-surface-elevated">
        <table className="w-full">
          <thead>
            <tr className="bg-surface-secondary border-b border-border-subtle">
              <th className="text-left px-6 py-4 text-[13px] font-semibold text-text-primary w-[280px]">
                API Feature
              </th>
              {plans.map((plan) => (
                <th
                  key={plan.id}
                  className="text-center px-4 py-4 text-[13px] font-semibold text-text-primary"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span>{plan.name}</span>
                    <span className="text-[11px] font-normal text-text-tertiary">
                      ${plan.monthly_price}/mo
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {API_DEFINITIONS.map((api) => (
              <tr key={api.key} className="hover:bg-surface-hover/50">
                <td className="px-6 py-4">
                  <div className="space-y-1">
                    <div className="text-[14px] font-medium text-text-primary">
                      {api.label}
                    </div>
                    <div className="text-[12px] text-text-tertiary leading-relaxed">
                      {api.description}
                    </div>
                    <div className="text-[11px] text-text-tertiary">
                      Default: {api.defaultValue ? "ON" : "OFF"}
                    </div>
                  </div>
                </td>
                {plans.map((plan) => (
                  <td key={plan.id} className="px-4 py-4 text-center">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={plan.api_settings[api.key]}
                        onChange={() => handleToggle(plan.id, api.key)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-surface-hover peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-action/30 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-action"></div>
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend / Help */}
      <div className="bg-surface-secondary border border-border-subtle rounded-[8px] p-4 space-y-3">
        <h3 className="text-[14px] font-semibold text-text-primary">About Ahrefs API Controls</h3>
        <div className="text-[13px] text-text-secondary space-y-2">
          <p>
            <strong className="text-text-primary">Keyword Discovery & Competitor Benchmark</strong> — 
            These are core features enabled by default for all plans. Disabling them will prevent users from 
            discovering new keywords or analyzing competitors.
          </p>
          <p>
            <strong className="text-text-primary">Blog Headings & FAQ Keywords</strong> — 
            These are premium features disabled by default. When enabled, blog generation will include 
            additional Ahrefs data to improve content quality with better headings and FAQ sections.
          </p>
          <p className="text-text-tertiary text-[12px]">
            Note: Changes take effect immediately. Users on affected plans will see the impact on their next API call.
          </p>
        </div>
      </div>
    </div>
  );
}
