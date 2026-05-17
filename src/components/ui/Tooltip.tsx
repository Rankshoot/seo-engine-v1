"use client";

import * as React from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";

/**
 * Wrap your whole app once with `<TooltipProvider>` (already done in providers),
 * then use:
 *
 *   <Tooltip content="Open AI assistant" side="right">
 *     <button>…</button>
 *   </Tooltip>
 */

export const TooltipProvider = RadixTooltip.Provider;

interface TooltipProps {
  content: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  delay?: number;
  children: React.ReactNode;
  /** Custom className on the floating tooltip content. */
  className?: string;
}

export function Tooltip({
  content,
  side = "top",
  align = "center",
  delay = 200,
  children,
  className,
}: TooltipProps) {
  if (content == null || content === "") {
    return <>{children}</>;
  }
  return (
    <RadixTooltip.Root delayDuration={delay}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            "z-50 max-w-[260px] rounded-md border border-border-default bg-surface-elevated px-2.5 py-1.5",
            "text-[12px] leading-snug text-text-primary shadow-(--shadow-md)",
            "data-[state=delayed-open]:animate-fade-in",
            className,
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-border-default" width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
