import { recordImageSearchCall } from "@/lib/admin/logging/record-provider-call";
import type { LicensedImage } from "@/lib/images/image-search";

/**
 * Pexels — optional higher-quality stock fallback.
 *
 * Only used when PEXELS_API_KEY is set. Pexels photos are free for commercial
 * use under the Pexels License (no attribution legally required, but we still
 * store the photographer + source page as a courtesy credit). This gives us a
 * polished stock option when the CC catalogs return thin/low-quality results.
 */

const PEXELS_ENDPOINT = "https://api.pexels.com/v1/search";
const TIMEOUT_MS = 12000;

interface PexelsPhoto {
  url?: string;
  photographer?: string;
  photographer_url?: string;
  alt?: string;
  src?: { large2x?: string; large?: string; original?: string };
}

export async function searchPexels(query: string, count: number): Promise<LicensedImage[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) return [];

  const started = Date.now();
  const params = new URLSearchParams({
    query,
    per_page: String(Math.min(Math.max(count, 1), 20)),
    orientation: "landscape",
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${PEXELS_ENDPOINT}?${params.toString()}`, {
      headers: { Authorization: apiKey, Accept: "application/json" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      recordImageSearchCall("pexels", false, Date.now() - started, 0, `HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as { photos?: PexelsPhoto[] };
    const photos = Array.isArray(data.photos) ? data.photos : [];
    recordImageSearchCall("pexels", true, Date.now() - started, photos.length);

    const out: LicensedImage[] = [];
    for (const p of photos) {
      const imageUrl = p.src?.large2x || p.src?.large || p.src?.original;
      if (!imageUrl) continue;
      // A missing alt must NOT fall back to the search query — that would
      // make the caller's relevance check trivially pass for a photo we know
      // nothing about.
      if (!p.alt?.trim()) continue;
      out.push({
        imageUrl,
        thumbnailUrl: p.src?.large,
        title: p.alt,
        sourcePage: p.url || "",
        author: p.photographer || "Pexels",
        license: "Pexels License",
        licenseUrl: "https://www.pexels.com/license/",
        provider: "pexels",
      });
    }
    return out;
  } catch (e) {
    recordImageSearchCall(
      "pexels",
      false,
      Date.now() - started,
      0,
      e instanceof Error ? e.message : String(e)
    );
    return [];
  }
}
