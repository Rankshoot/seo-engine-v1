import { searchOpenverse } from "@/lib/images/providers/openverse";
import { searchWikimedia } from "@/lib/images/providers/wikimedia";
import { searchPexels } from "@/lib/images/providers/pexels";

/**
 * A copyright-safe image with the attribution + license data a blog needs to
 * reuse it legally. Unlike the old Serper/Google path (best-effort CC filter,
 * nothing stored), every provider here returns a verifiable license and a
 * source/creator we can credit on the page.
 */
export interface LicensedImage {
  /** Direct media URL to fetch + convert to webp. */
  imageUrl: string;
  thumbnailUrl?: string;
  title: string;
  /** Landing page to attribute / link back to. */
  sourcePage: string;
  /** Creator/photographer name for the credit line. */
  author: string;
  /** Human-readable license label, e.g. "CC BY 2.0", "CC0 (Public Domain)", "Pexels License". */
  license: string;
  licenseUrl: string;
  provider: "openverse" | "wikimedia" | "pexels";
}

/** Credit record persisted on `blogs.content_data.image_credits`. */
export interface ImageCredit {
  storedUrl: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourcePage: string;
  provider: LicensedImage["provider"];
  placement: "cover" | "section";
}

/**
 * Whether a license legally requires visible attribution. CC-BY family and most
 * Wikimedia CC licenses do; CC0 / public-domain and the Pexels License do not
 * (we still store those in content_data, just don't force a credit line).
 */
export function requiresAttribution(license: string): boolean {
  const l = license.toLowerCase();
  if (l.includes("cc0") || l.includes("public domain") || l.includes("pexels")) return false;
  return true;
}

/**
 * Builds a compact "## Image credits" markdown section for the images that
 * require attribution. Appended to the published content so the credit travels
 * to every destination (in-app viewer, Strapi blog, WordPress, Shopify).
 * Returns "" when no image needs a visible credit.
 */
export function buildImageCreditsMarkdown(credits: ImageCredit[]): string {
  const lines = credits
    .filter((c) => requiresAttribution(c.license))
    .map((c) => {
      const who = c.sourcePage ? `[${c.author}](${c.sourcePage})` : c.author;
      const lic = c.licenseUrl ? `[${c.license}](${c.licenseUrl})` : c.license;
      return `- Image by ${who}, licensed under ${lic}.`;
    });
  if (!lines.length) return "";
  return `\n\n## Image credits\n\n${lines.join("\n")}\n`;
}

function dedupeByUrl(images: LicensedImage[]): LicensedImage[] {
  const seen = new Set<string>();
  const out: LicensedImage[] = [];
  for (const img of images) {
    const key = img.imageUrl.split("?")[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(img);
  }
  return out;
}

/**
 * Searches copyright-safe image sources for `query`, returning up to `count`
 * results with license + attribution. Order of preference:
 *   1. Openverse (huge CC / public-domain catalog, commercial+modification only)
 *   2. Wikimedia Commons (public-domain / CC fallback)
 *   3. Pexels (only if PEXELS_API_KEY is set)
 *
 * Providers are queried in order and results accumulated until we have `count`
 * distinct images. Every provider is best-effort — a failing/empty provider
 * just contributes nothing and we fall through to the next. Returns [] if all
 * sources come up empty (caller should then skip that image, never fabricate).
 */
export async function searchLicensedImages(query: string, count = 5): Promise<LicensedImage[]> {
  const target = Math.min(Math.max(count, 1), 20);
  const collected: LicensedImage[] = [];

  const providers: Array<(q: string, n: number) => Promise<LicensedImage[]>> = [
    searchOpenverse,
    searchWikimedia,
    searchPexels,
  ];

  for (const search of providers) {
    if (collected.length >= target) break;
    try {
      const results = await search(query, target);
      collected.push(...results);
    } catch {
      // Provider-level failures are already logged inside each provider.
    }
  }

  return dedupeByUrl(collected).slice(0, target);
}
