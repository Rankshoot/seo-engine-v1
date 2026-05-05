import type { AIPageExtended } from "@/features/ai-assistant/types";

export function detectAIPageFromPath(pathname: string): AIPageExtended | null {
  if (!pathname) return null;
  if (pathname.includes("/keywords")) return "keywords";
  if (pathname.includes("/competitors")) return "competitors";
  if (pathname.includes("/calendar")) return "calendar";
  if (pathname.includes("/blogs")) return "blogs";
  if (pathname.includes("/audit")) return "audit";
  return null;
}
