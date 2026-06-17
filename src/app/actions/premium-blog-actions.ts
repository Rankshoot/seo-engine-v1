"use server";

import { currentUser } from "@clerk/nextjs/server";
import { QuotaService } from "@/services/quota";
import { ahrefsMatchingTermsAll, ahrefsMatchingTermsQuestions } from "@/lib/ahrefs";
import { fetchGoogleOrganicSerpTopUrls } from "@/lib/dataforseo";
import { locationCodeFromTargetRegion } from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase";

export interface AhrefsKeywordResult {
  keyword: string;
  volume: number;
  difficulty: number | null;
}

export interface CompetitorPage {
  url: string;
  title: string;
  domain: string;
  position: number;
}

/**
 * Fetch Ahrefs keyword intelligence data for the blog generator's advanced options.
 * Checks that user has credits for ahrefs_h2s and/or ahrefs_faqs before calling APIs.
 * Does NOT deduct credits here — credits are deducted at generation time.
 */
export async function fetchAhrefsKeywordDataAction(
  keyword: string,
  region: string
): Promise<
  | { success: true; h2Keywords: AhrefsKeywordResult[]; faqKeywords: AhrefsKeywordResult[]; hasH2s: boolean; hasFaqs: boolean }
  | { success: false; error: string }
> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  try {
    const quotaStatus = await QuotaService.getUserQuotaStatus(user.id);
    const hasH2sCredits = quotaStatus.ahrefs_h2s.remaining > 0;
    const hasFaqsCredits = quotaStatus.ahrefs_faqs.remaining > 0;

    if (!hasH2sCredits && !hasFaqsCredits) {
      return { success: false, error: "No Ahrefs keyword credits available. Contact your admin." };
    }

    const [h2Results, faqResults] = await Promise.all([
      hasH2sCredits
        ? ahrefsMatchingTermsAll(keyword, region, 7, 0).catch(() => [])
        : Promise.resolve([]),
      hasFaqsCredits
        ? ahrefsMatchingTermsQuestions(keyword, region, 5, 0).catch(() => [])
        : Promise.resolve([]),
    ]);

    return {
      success: true,
      hasH2s: hasH2sCredits,
      hasFaqs: hasFaqsCredits,
      h2Keywords: h2Results.map((k) => ({
        keyword: k.keyword,
        volume: k.volume,
        difficulty: k.difficulty,
      })),
      faqKeywords: faqResults.map((k) => ({
        keyword: k.keyword,
        volume: k.volume,
        difficulty: k.difficulty,
      })),
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to fetch keyword data" };
  }
}

/**
 * Fetch the top 5 ranking pages for a keyword via DataForSEO.
 * Used to preview what the deep analysis will analyse.
 * Does NOT deduct credits — credits are deducted at generation time.
 */
export async function fetchCompetitorPagesAction(
  keyword: string,
  projectId: string
): Promise<
  | { success: true; pages: CompetitorPage[] }
  | { success: false; error: string }
> {
  const user = await currentUser();
  if (!user) return { success: false, error: "Not authenticated" };

  try {
    const quotaStatus = await QuotaService.getUserQuotaStatus(user.id);
    if (quotaStatus.deep_analysis.remaining <= 0) {
      return { success: false, error: "No Deep Analysis credits available. Contact your admin." };
    }

    // Verify project belongs to user
    const db = getSupabaseAdmin();
    const { data: project, error: pErr } = await db
      .from("projects")
      .select("target_region, target_language")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .single();

    if (pErr || !project) {
      return { success: false, error: "Project not found" };
    }

    const locationCode = locationCodeFromTargetRegion(project.target_region ?? "us");
    const { urls } = await fetchGoogleOrganicSerpTopUrls(keyword, {
      locationCode,
      languageCode: project.target_language ?? "en",
      limit: 5,
    });

    const pages: CompetitorPage[] = urls.map((u, i) => {
      let domain = "";
      try { domain = new URL(u.url).hostname.replace(/^www\./, ""); } catch { /* */ }
      return {
        url: u.url,
        title: u.title ?? u.url,
        domain,
        position: i + 1,
      };
    });

    return { success: true, pages };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to fetch competitor pages" };
  }
}
