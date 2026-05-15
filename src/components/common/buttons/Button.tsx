"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "destructive"
  | "action";

export type ButtonSize = "xs" | "sm" | "md" | "lg";
export type ButtonShape = "rounded" | "pill";

const sizeClass: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-[12px] gap-1.5",
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-3.5 text-[13px] gap-2",
  lg: "h-10 px-5 text-[14px] gap-2",
};

const shapeClass: Record<ButtonShape, Record<ButtonSize, string>> = {
  rounded: { xs: "rounded-sm", sm: "rounded-md", md: "rounded-md", lg: "rounded-lg" },
  pill:    { xs: "rounded-full", sm: "rounded-full", md: "rounded-full", lg: "rounded-full" },
};

const variantClass: Record<ButtonVariant, string> = {
  primary:
    "bg-text-primary text-surface-primary hover:opacity-90 active:opacity-80 disabled:opacity-50",
  secondary:
    "bg-surface-elevated text-text-primary border border-border-subtle hover:border-border-strong hover:bg-surface-hover disabled:opacity-50",
  outline:
    "bg-transparent text-text-primary border border-border-default hover:bg-surface-hover disabled:opacity-50",
  ghost:
    "bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary disabled:opacity-50",
  destructive:
    "bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20 disabled:opacity-50",
  action:
    "bg-brand-action text-white hover:bg-brand-action-hover active:brightness-95 disabled:opacity-50",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    shape = "rounded",
    loading = false,
    iconLeft,
    iconRight,
    fullWidth,
    className,
    disabled,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-medium tabular-nums",
        "transition-colors duration-(--duration-fast) ease-out",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-action/40",
        "disabled:cursor-not-allowed",
        sizeClass[size],
        shapeClass[shape][size],
        variantClass[variant],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current"
          aria-hidden
        />
      ) : iconLeft ? (
        <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{iconLeft}</span>
      ) : null}
      {children ? <span className="truncate">{children}</span> : null}
      {!loading && iconRight ? (
        <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{iconRight}</span>
      ) : null}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, "iconLeft" | "iconRight" | "children"> {
  "aria-label": string;
  children: ReactNode;
}

const iconButtonSquare: Record<ButtonSize, string> = {
  xs: "h-7 w-7",
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-10 w-10",
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = "md", variant = "ghost", className, children, ...rest },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      className={cn("px-0", iconButtonSquare[size], className)}
      {...rest}
    >
      {children as never}
    </Button>
  );
});
