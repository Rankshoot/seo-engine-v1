"use client";

import { forwardRef } from "react";
import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  SelectHTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/cn";

const baseField =
  "block w-full rounded-md border border-border-subtle bg-surface-secondary text-[14px] text-text-primary placeholder:text-text-tertiary " +
  "outline-none transition-colors duration-(--duration-fast) ease-out " +
  "focus:border-brand-action focus:ring-1 focus:ring-brand-action/60 " +
  "disabled:opacity-50 disabled:cursor-not-allowed " +
  "aria-[invalid=true]:border-status-danger/60 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-status-danger/40";

const sizeClass = {
  sm: "h-8 px-2.5 text-[13px]",
  md: "h-9 px-3",
  lg: "h-10 px-3.5",
} as const;

export type FieldSize = keyof typeof sizeClass;

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: FieldSize;
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { inputSize = "md", invalid, className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(baseField, sizeClass[inputSize], className)}
      {...rest}
    />
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, rows = 4, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(baseField, "min-h-[80px] py-2.5 px-3 leading-relaxed resize-y", className)}
      {...rest}
    />
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  inputSize?: FieldSize;
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { inputSize = "md", invalid, className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          baseField,
          sizeClass[inputSize],
          "appearance-none pr-8 cursor-pointer",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
});

/* ───────── Labelled wrapper ───────── */

export interface FieldProps {
  label?: ReactNode;
  htmlFor?: string;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({
  label,
  htmlFor,
  description,
  error,
  required,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      ) : null}
      {children}
      {description && !error ? (
        <p className="text-[12px] text-text-tertiary leading-relaxed">{description}</p>
      ) : null}
      {error ? (
        <p className="text-[12px] text-status-danger leading-relaxed">{error}</p>
      ) : null}
    </div>
  );
}

export function Label({
  htmlFor,
  required,
  className,
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "block text-[12px] font-medium text-text-secondary",
        className,
      )}
    >
      {children}
      {required ? <span className="ml-0.5 text-text-tertiary">*</span> : null}
    </label>
  );
}
