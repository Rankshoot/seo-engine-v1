import type { AIPage } from "@/features/ai-assistant/types";

export function detectAIPageFromPath(pathname: string): AIPage | null {
  if (!pathname) return null;
  if (pathname.includes("/keywords")) return "keywords";
  if (pathname.includes("/competitors")) return "competitors";
  if (pathname.includes("/calendar")) return "calendar";
  if (pathname.includes("/blogs")) return "blogs";
  return null;
}
