/**
 * Minimal zero-dependency class joiner. Filters falsy values so callers can do
 *   cn("a", cond && "b", { c: cond })
 * without pulling in `clsx` or `classnames`.
 */
export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | Record<string, boolean | null | undefined>
  | ClassValue[];

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  for (const v of inputs) {
    if (!v) continue;
    if (typeof v === "string" || typeof v === "number") {
      out.push(String(v));
    } else if (Array.isArray(v)) {
      const joined = cn(...v);
      if (joined) out.push(joined);
    } else if (typeof v === "object") {
      for (const [k, val] of Object.entries(v)) {
        if (val) out.push(k);
      }
    }
  }
  return out.join(" ");
}
