/**
 * Class joiner — `clsx` for conditional composition + `tailwind-merge` so the
 * later utility always wins when callers compose overrides. shadcn-style.
 *
 *   cn("px-4", cond && "px-2", { "text-red": isError })
 *
 * Both deps are tiny and tree-shakeable.
 */
import { clsx, type ClassValue as ClsxClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export type ClassValue = ClsxClassValue;

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
