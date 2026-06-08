"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/common/buttons/Button";

export type DialogSize = "sm" | "md" | "lg" | "xl" | "full";

const widthClass: Record<DialogSize, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "max-w-[min(96vw,1400px)]",
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  size?: DialogSize;
  /** Set to false when the dialog manages its own header/scroll. */
  unstyled?: boolean;
  title?: ReactNode;
  description?: ReactNode;
  /** Bottom action bar — pass buttons here. */
  footer?: ReactNode;
  /** Set to false to disable Escape-to-close (e.g. while a long task is running). */
  closeOnEscape?: boolean;
  /** Set to false to disable backdrop-click-to-close. */
  closeOnBackdrop?: boolean;
  /** Optional override for the outer container width. */
  className?: string;
  /** Inner content. */
  children: ReactNode;
}

/**
 * Dialog — portal-based modal with backdrop, scroll lock, Escape, focus return.
 * Use `unstyled` if the modal renders its own header/scroll layout
 * (e.g. AuditDetailModal which has split panes).
 */
export function Dialog({
  open,
  onClose,
  size = "md",
  unstyled = false,
  title,
  description,
  footer,
  closeOnEscape = true,
  closeOnBackdrop = true,
  className,
  children,
}: DialogProps) {
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = (document.activeElement as HTMLElement) ?? null;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeOnEscape) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      previousFocus.current?.focus?.();
    };
  }, [open, onClose, closeOnEscape]);

  if (!open) return null;
  if (typeof window === "undefined") return null;

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
      className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-6"
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={async () => {
          if (closeOnBackdrop) {
            try {
              await onClose();
            } catch (err) {
              console.error("Error closing dialog via backdrop:", err);
            }
          }
        }}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-(--duration-base) animate-[fade-in_0.18s_ease-out]"
        tabIndex={-1}
      />
      <div
        className={cn(
          "relative z-10 w-full",
          widthClass[size],
          unstyled
            ? "" // caller controls everything
            : cn(
                "flex max-h-[min(92vh,900px)] flex-col overflow-hidden rounded-card border border-border-default bg-surface-secondary shadow-(--shadow-xl)",
                "animate-[scale-in_0.18s_var(--ease-out)_forwards]",
              ),
          className,
        )}
      >
        {unstyled ? (
          children
        ) : (
          <>
            {(title || description) && (
              <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-4">
                <div className="min-w-0">
                  {typeof title === "string" || typeof title === "number" ? (
                    <h2 className="text-[16px] font-semibold tracking-tight text-text-primary truncate">
                      {title}
                    </h2>
                  ) : (
                    title
                  )}
                  {description ? (
                    <p className="mt-1 text-[12.5px] text-text-tertiary leading-relaxed">
                      {description}
                    </p>
                  ) : null}
                </div>
                <IconButton
                  aria-label="Close"
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await onClose();
                    } catch (err) {
                      console.error("Error closing dialog via close button:", err);
                    }
                  }}
                  className="-mr-2"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    className="h-4 w-4"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6l-12 12" />
                  </svg>
                </IconButton>
              </header>
            )}
            <div className="flex-1 min-h-0 overflow-auto px-6 py-5">{children}</div>
            {footer ? (
              <footer className="flex items-center justify-end gap-2 border-t border-border-subtle px-6 py-3">
                {footer}
              </footer>
            ) : null}
          </>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
