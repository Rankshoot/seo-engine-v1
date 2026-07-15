import { recordImageSearchCall } from "@/lib/admin/logging/record-provider-call";
import type { LicensedImage } from "@/lib/images/image-search";

/**
 * Openverse — the primary licensed-image source.
 *
 * Openverse (https://openverse.org, run by WordPress.org) aggregates ~700M
 * openly-licensed and public-domain images and exposes a free JSON API. We
 * request only images that are safe for a commercial brand to reuse AND modify
 * via `license_type=commercial,modification`, and we carry the returned license
 * + creator + landing page so the blog can attribute correctly.
 *
 * Auth is optional: anonymous requests work at a lower rate limit. If
 * OPENVERSE_CLIENT_ID / OPENVERSE_CLIENT_SECRET are set we could exchange them
 * for a bearer token, but the anonymous tier is enough for per-blog usage.
 */

const OPENVERSE_ENDPOINT = "https://api.openverse.org/v1/images/";
const TIMEOUT_MS = 12000;

interface OpenverseResult {
  id?: string;
  title?: string;
  url?: string;
  thumbnail?: string;
  foreign_landing_url?: string;
  creator?: string;
  license?: string;
  license_version?: string;
  license_url?: string;
}

/** Turns Openverse's `license` + `license_version` into a display label like "CC BY 2.0". */
function formatLicense(license?: string, version?: string): string {
  if (!license) return "Unknown license";
  const code = license.toLowerCase();
  // Public-domain marks / CC0 have no "CC BY" style prefix.
  if (code === "cc0" || code === "pdm") {
    return code === "cc0" ? "CC0 (Public Domain)" : "Public Domain Mark";
  }
  const label = `CC ${license.toUpperCase()}`;
  return version ? `${label} ${version}` : label;
}

export async function searchOpenverse(query: string, count: number): Promise<LicensedImage[]> {
  const started = Date.now();
  const params = new URLSearchParams({
    q: query,
    page_size: String(Math.min(Math.max(count, 1), 20)),
    license_type: "commercial,modification",
    mature: "false",
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${OPENVERSE_ENDPOINT}?${params.toString()}`, {
      headers: { Accept: "application/json", "User-Agent": "Rankshoot/1.0 (content image sourcing)" },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      recordImageSearchCall("openverse", false, Date.now() - started, 0, `HTTP ${res.status}`);
      return [];
    }

    const data = (await res.json()) as { results?: OpenverseResult[] };
    const results = Array.isArray(data.results) ? data.results : [];
    recordImageSearchCall("openverse", true, Date.now() - started, results.length);

    return results
      .filter((r) => r.url && r.url.startsWith("http"))
      .map((r) => ({
        imageUrl: r.url as string,
        thumbnailUrl: r.thumbnail,
        title: r.title || query,
        sourcePage: r.foreign_landing_url || r.url || "",
        author: r.creator || "Unknown",
        license: formatLicense(r.license, r.license_version),
        licenseUrl: r.license_url || "",
        provider: "openverse" as const,
      }));
  } catch (e) {
    recordImageSearchCall(
      "openverse",
      false,
      Date.now() - started,
      0,
      e instanceof Error ? e.message : String(e)
    );
    return [];
  }
}
