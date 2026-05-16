"use client";

import { cn } from "@/lib/cn";

function FilterSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("w-full lg:w-40", className)}>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full h-9 rounded-md border border-border-subtle bg-surface-elevated px-3 text-[13px] text-text-primary",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-action/40"
        )}
      >
        {options.map((o) => (
          <option key={o.value || "all"} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function AdminProviderFilter({
  value,
  providers,
  onChange,
}: {
  value: string;
  providers: readonly string[];
  onChange: (provider: string) => void;
}) {
  return (
    <FilterSelect
      label="Provider"
      value={value}
      onChange={onChange}
      options={[
        { value: "", label: "All providers" },
        ...providers.map((p) => ({
          value: p,
          label: p.charAt(0).toUpperCase() + p.slice(1),
        })),
      ]}
    />
  );
}

export function AdminSeverityFilter({
  value,
  severities,
  onChange,
}: {
  value: string;
  severities: readonly string[];
  onChange: (severity: string) => void;
}) {
  return (
    <FilterSelect
      label="Severity"
      value={value}
      onChange={onChange}
      options={[
        { value: "", label: "All severities" },
        ...severities.map((s) => ({
          value: s,
          label: s.charAt(0).toUpperCase() + s.slice(1),
        })),
      ]}
    />
  );
}

export function AdminStatusFilter({
  label,
  value,
  statuses,
  onChange,
}: {
  label?: string;
  value: string;
  statuses: readonly string[];
  onChange: (status: string) => void;
}) {
  return (
    <FilterSelect
      label={label ?? "Status"}
      value={value}
      onChange={onChange}
      options={[
        { value: "", label: "All statuses" },
        ...statuses.map((s) => ({
          value: s,
          label: s.charAt(0).toUpperCase() + s.slice(1),
        })),
      ]}
    />
  );
}
