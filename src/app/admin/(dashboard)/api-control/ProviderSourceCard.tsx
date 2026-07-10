"use client";

import { useState } from "react";
import { toast } from "react-hot-toast";
import { useAdminSettings, useUpdateAdminSettings } from "@/lib/query/admin-queries";

const TOGGLES = [
  {
    key: "ahrefs_enabled" as const,
    label: "Ahrefs",
    description: "Primary keyword-data source for Organic Keywords discovery.",
  },
  {
    key: "dataforseo_enabled" as const,
    label: "DataForSEO",
    description: "Alternate keyword-data source, used as the fallback provider below.",
  },
  {
    key: "dataforseo_fallback_enabled" as const,
    label: "Fall back to DataForSEO if Ahrefs fails",
    description: "When off, a failed Ahrefs call errors out instead of retrying against DataForSEO.",
  },
];

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="peer sr-only"
      />
      <div className="peer h-6 w-11 rounded-full bg-surface-hover transition-colors after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-brand-action peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-action/30 peer-disabled:opacity-50" />
    </label>
  );
}

export function ProviderSourceCard() {
  const { data, isLoading } = useAdminSettings();
  const updateSettings = useUpdateAdminSettings();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  if (isLoading || !data) {
    return (
      <div className="animate-pulse rounded-[12px] border border-border-subtle bg-surface-elevated p-6">
        <div className="h-4 w-48 rounded bg-surface-hover" />
      </div>
    );
  }

  const providers = data.providers;

  const handleToggle = (key: (typeof TOGGLES)[number]["key"]) => {
    setPendingKey(key);
    updateSettings.mutate(
      { providers: { [key]: !providers[key] } },
      {
        onSuccess: () => toast.success("Keyword data source updated"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to update setting"),
        onSettled: () => setPendingKey(null),
      }
    );
  };

  return (
    <div className="space-y-4 rounded-[12px] border border-border-subtle bg-surface-elevated p-6">
      <div>
        <h2 className="text-[16px] font-semibold text-text-primary">Keyword Data Source</h2>
        <p className="mt-1 text-[13px] text-text-tertiary">
          Global switch for which provider answers Organic Keywords discovery requests, across all plans.
        </p>
      </div>
      <div className="divide-y divide-border-subtle">
        {TOGGLES.map((t) => (
          <div key={t.key} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-[14px] font-medium text-text-primary">{t.label}</p>
              <p className="text-[12px] text-text-tertiary">{t.description}</p>
            </div>
            <ToggleSwitch
              checked={providers[t.key]}
              onChange={() => handleToggle(t.key)}
              disabled={pendingKey === t.key}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
