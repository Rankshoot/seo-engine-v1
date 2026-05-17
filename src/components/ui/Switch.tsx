"use client";

import * as React from "react";
import * as RadixSwitch from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

/** Animated toggle — Linear-style. Use for settings, AI mode, persisted prefs. */
export const Switch = React.forwardRef<
  React.ElementRef<typeof RadixSwitch.Root>,
  React.ComponentPropsWithoutRef<typeof RadixSwitch.Root>
>(function Switch({ className, ...rest }, ref) {
  return (
    <RadixSwitch.Root
      ref={ref}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full",
        "border border-border-subtle bg-surface-elevated",
        "transition-colors duration-(--duration-fast)",
        "data-[state=checked]:border-brand-violet/60 data-[state=checked]:bg-brand-violet",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-action/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      <RadixSwitch.Thumb
        className={cn(
          "block h-3.5 w-3.5 translate-x-1 rounded-full bg-surface-primary shadow-(--shadow-xs)",
          "transition-transform duration-(--duration-fast) ease-out",
          "data-[state=checked]:translate-x-4 data-[state=checked]:bg-white",
        )}
      />
    </RadixSwitch.Root>
  );
});
