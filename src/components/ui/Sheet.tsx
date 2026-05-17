"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";
import { X } from "lucide-react";

/**
 * Right-side sliding panel — for filters, AI assistant in mobile, settings.
 * Same API surface as shadcn's <Sheet>: trigger → portal → overlay → content.
 */

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

const sideClasses: Record<"left" | "right" | "top" | "bottom", string> = {
  right:
    "inset-y-0 right-0 h-full w-full sm:max-w-[420px] border-l data-[state=open]:animate-[slide-in-right_240ms_ease-out] data-[state=closed]:animate-[slide-out-right_180ms_ease-in]",
  left:
    "inset-y-0 left-0 h-full w-full sm:max-w-[420px] border-r data-[state=open]:animate-[slide-in-left_240ms_ease-out]",
  top: "inset-x-0 top-0 w-full border-b data-[state=open]:animate-[slide-in-top_240ms_ease-out]",
  bottom: "inset-x-0 bottom-0 w-full border-t data-[state=open]:animate-[slide-in-bottom_240ms_ease-out]",
};

interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof Dialog.Content> {
  side?: "left" | "right" | "top" | "bottom";
  hideClose?: boolean;
}

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof Dialog.Content>,
  SheetContentProps
>(function SheetContent({ side = "right", className, hideClose, children, ...rest }, ref) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-fade-in" />
      <Dialog.Content
        ref={ref}
        className={cn(
          "fixed z-50 flex flex-col gap-4 border-border-subtle bg-surface-secondary p-6 shadow-(--shadow-xl) focus:outline-none",
          sideClasses[side],
          className,
        )}
        {...rest}
      >
        {children}
        {!hideClose && (
          <Dialog.Close
            className="absolute right-4 top-4 rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-primary"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </Dialog.Close>
        )}
      </Dialog.Content>
    </Dialog.Portal>
  );
});

export function SheetHeader({
  title,
  description,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1 border-b border-border-subtle pb-4", className)}>
      <Dialog.Title className="text-[16px] font-semibold tracking-tight">{title}</Dialog.Title>
      {description && (
        <Dialog.Description className="text-[13px] leading-relaxed text-text-tertiary">
          {description}
        </Dialog.Description>
      )}
    </div>
  );
}
