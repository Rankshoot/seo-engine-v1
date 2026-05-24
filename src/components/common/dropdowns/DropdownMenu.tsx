"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * DropdownMenu — generic click-to-open menu used by row actions, status pickers,
 * and any "..." menu across the app. Closes on outside click, Escape, or
 * focus loss. Trigger is a render-prop that receives `{ ref, onClick, expanded }`.
 *
 * Existing dropdowns (`StatusActionDropdown`, `KeywordActionDropdown`) keep
 * working — this is for new callers that want consistent behaviour.
 */
export interface DropdownMenuProps {
  /** Trigger element — must accept a `ref`, `onClick`, and `aria-expanded`. */
  trigger: ReactElement<{
    ref?: React.Ref<HTMLButtonElement>;
    onClick?: (e: React.MouseEvent) => void;
    "aria-expanded"?: boolean;
    "aria-haspopup"?: string;
  }>;
  children: ReactNode;
  align?: "start" | "end";
  /** Width preset for the menu. Override with className if needed. */
  menuWidth?: "auto" | "sm" | "md" | "lg" | "stretch";
  className?: string;
  /** Root becomes `block w-full` so a full-width trigger (e.g. sidebar export) lays out correctly. */
  fillWidth?: boolean;
  /** Close the menu after a click on any `role="menuitem"` control inside the panel. */
  closeOnMenuClick?: boolean;
}

const widthClass: Record<Exclude<NonNullable<DropdownMenuProps["menuWidth"]>, "stretch">, string> = {
  auto: "min-w-[160px]",
  sm: "w-[180px]",
  md: "w-[220px]",
  lg: "w-[280px]",
};

export function DropdownMenu({
  trigger,
  children,
  align = "end",
  menuWidth = "md",
  className,
  fillWidth = false,
  closeOnMenuClick = false,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!isValidElement(trigger)) {
    throw new Error("<DropdownMenu> requires a single ReactElement trigger");
  }

  const enhancedTrigger = cloneElement(trigger, {
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpen(v => !v);
      trigger.props.onClick?.(e);
    },
    "aria-expanded": open,
    "aria-haspopup": "menu",
  });

  const positionClass =
    menuWidth === "stretch"
      ? "left-0 right-0 w-full min-w-0"
      : align === "end"
        ? "right-0"
        : "left-0";
  const sizeClass = menuWidth === "stretch" ? "" : widthClass[menuWidth];

  return (
    <div ref={containerRef} className={cn("relative", fillWidth ? "block w-full" : "inline-block")}>
      {enhancedTrigger}
      {open ? (
        <div
          id={menuId}
          role="menu"
          onClick={e => {
            if (!closeOnMenuClick) return;
            if ((e.target as HTMLElement).closest('button[role="menuitem"]')) {
              queueMicrotask(() => setOpen(false));
            }
          }}
          className={cn(
            "absolute z-50 mt-1.5 rounded-md border border-border-default bg-surface-elevated p-1 shadow-(--shadow-md)",
            "animate-[fade-in_0.12s_ease-out]",
            positionClass,
            sizeClass,
            className,
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export interface DropdownItemProps {
  onSelect?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function DropdownItem({
  onSelect,
  disabled,
  destructive,
  icon,
  trailing,
  children,
  className,
}: DropdownItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-[13px] transition-colors",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        destructive
          ? "text-rose-400 hover:bg-rose-500/10"
          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
        className,
      )}
    >
      {icon ? (
        <span className="shrink-0 text-text-tertiary [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      ) : null}
      <span className="flex-1 truncate">{children}</span>
      {trailing ? <span className="shrink-0 text-text-tertiary">{trailing}</span> : null}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-border-subtle" role="separator" />;
}

export function DropdownLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">
      {children}
    </div>
  );
}
