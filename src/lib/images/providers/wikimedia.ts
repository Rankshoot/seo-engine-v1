import { recordImageSearchCall } from "@/lib/admin/logging/record-provider-call";
import type { LicensedImage } from "@/lib/images/image-search";

/**
 * Wikimedia Commons — fallback licensed-image source.
 *
 * Commons hosts public-domain and CC-licensed media. We use the MediaWiki API's
 * search generator over the File namespace (6) and pull `imageinfo` with
 * `extmetadata`, which carries LicenseShortName/Artist/LicenseUrl. Commons'
 * search API has no server-side license filter, so we filter client-side to
 * anything genuinely reusable (public domain, CC0, or a real CC license) and
 * explicitly reject "fair use" / non-free / unlicensed results. Some accepted
 * results (CC-BY variants) legally require attribution; the product does not
 * render a visible credit (by design), but license/author/source are still
 * captured and persisted to `content_data.image_credits` as an internal
 * compliance record. The API is free and needs no key; Wikimedia asks only
 * for a descriptive User-Agent.
 */

const COMMONS_ENDPOINT = "https://commons.wikimedia.org/w/api.php";
const TIMEOUT_MS = 12000;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif)$/i;

interface CommonsImageInfo {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  extmetadata?: Record<string, { value?: string }>;
}
interface CommonsPage {
  title?: string;
  imageinfo?: CommonsImageInfo[];
}

/** extmetadata values are often HTML fragments; strip tags for a clean credit line. */
function stripHtml(value?: string): string {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export async function searchWikimedia(query: string, count: number): Promise<LicensedImage[]> {
  const started = Date.now();
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6", // File namespace
    gsrlimit: String(Math.min(Math.max(count, 1), 20)),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "1600",
    origin: "*",
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${COMMONS_ENDPOINT}?${params.toString()}`, {
      headers: { Accept: "application/json", "User-Agent": "Rankshoot/1.0 (content image sourcing; +https://rankshoot.com)" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      recordImageSearchCall("wikimedia", false, Date.now() - started, 0, `HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
    const pages = data.query?.pages ? Object.values(data.query.pages) : [];
    recordImageSearchCall("wikimedia", true, Date.now() - started, pages.length);

    const out: LicensedImage[] = [];
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      const url = info?.url;
      if (!url || !IMAGE_EXT.test(url)) continue;
      // A missing title must NOT fall back to the search query — that would
      // make the caller's relevance check trivially pass for an image we
      // know nothing about.
      if (!page.title?.trim()) continue;
      const meta = info?.extmetadata ?? {};
      const license = stripHtml(meta.LicenseShortName?.value) || "";
      // Reject anything not clearly reusable: no license info, "fair use",
      // non-free, or plain "copyright". A bare "CC" without a recognizable
      // public-domain/CC-license token is also rejected as unverifiable.
      if (!license || /fair use|non-free|all rights reserved|^copyright/i.test(license)) continue;
      if (!/public domain|pd-|cc0|cc[- ]?by/i.test(license)) continue;
      out.push({
        imageUrl: url,
        thumbnailUrl: info?.thumburl,
        title: page.title.replace(/^File:/, "").replace(IMAGE_EXT, ""),
        sourcePage: info?.descriptionurl || url,
        author: stripHtml(meta.Artist?.value) || "Wikimedia Commons",
        license,
        licenseUrl: meta.LicenseUrl?.value || "",
        provider: "wikimedia" as const,
      });
    }
    return out;
  } catch (e) {
    recordImageSearchCall(
      "wikimedia",
      false,
      Date.now() - started,
      0,
      e instanceof Error ? e.message : String(e)
    );
    return [];
  }
}
