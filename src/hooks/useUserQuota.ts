import { useQuery } from "@tanstack/react-query";
import type { ClientQuotaStatus } from "@/services/quota";

async function fetchUserQuota(): Promise<ClientQuotaStatus> {
  const res = await fetch("/api/user-quota", { cache: "no-store" });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Failed to fetch quota");
  return json.data as ClientQuotaStatus;
}

export function useUserQuota() {
  const { data, isLoading, error, refetch } = useQuery<ClientQuotaStatus>({
    queryKey: ["user-quota"],
    queryFn: fetchUserQuota,
    staleTime: 30_000,       // 30s — soft TTL
    gcTime: 5 * 60_000,      // 5min in cache
    refetchOnWindowFocus: false,
    retry: 2,
  });

  return {
    quota: data ?? null,
    isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
    // Convenience helpers
    canCreateProject: data ? data.projects.remaining > 0 : true,
    canGenerateBlog: data ? data.blogs.remaining > 0 : true,
    canGenerateEbook: data ? data.ebooks.remaining > 0 : true,
    canGenerateWhitepaper: data ? data.whitepapers.remaining > 0 : true,
    canGenerateLinkedIn: data ? data.linkedin.remaining > 0 : true,
    hasAiCredits: data ? data.ai_credits.remaining > 0 : true,
    canFetchMoreKeywords: data ? data.keywords_fetched.remaining > 0 : true,
    // Premium blog feature credits
    hasAhrefsH2sCredits: data ? data.ahrefs_h2s.remaining > 0 : false,
    hasAhrefsFaqsCredits: data ? data.ahrefs_faqs.remaining > 0 : false,
    hasDeepAnalysisCredits: data ? data.deep_analysis.remaining > 0 : false,
  };
}
