"use client";

const pillInactive =
  "inline-flex h-8 shrink-0 items-center rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary shadow-sm transition-[transform,colors] duration-200 hover:border-border-strong hover:text-text-primary hover:-translate-y-px active:scale-95 disabled:pointer-events-none disabled:opacity-40";

const pillActive =
  "inline-flex h-8 shrink-0 items-center rounded-full border border-brand-action/35 bg-brand-action/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-action shadow-sm ring-1 ring-brand-action/15 disabled:pointer-events-none disabled:opacity-40";

export type PillTabItem<T extends string = string> = {
  id: T;
  label: string;
  count?: number;
};

type Props<T extends string> = {
  items: PillTabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  className?: string;
  disabled?: boolean;
};

export function PillTabFilterBar<T extends string>({
  items,
  activeId,
  onChange,
  className = "",
  disabled,
}: Props<T>) {
  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-1.5 ${className}`}>
      {items.map(({ id, label, count }) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(id)}
          className={activeId === id ? pillActive : pillInactive}
        >
          {label}
          {count !== undefined ? ` (${count})` : ""}
        </button>
      ))}
    </div>
  );
}
