/**
 * Public site base URL, used for canonical links, JSON-LD `@id`, OpenGraph
 * URLs, sitemap.xml, and robots.txt.
 *
 * Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL — set this in prod to your real domain.
 *   2. VERCEL_URL — auto-set on Vercel preview/prod deployments.
 *   3. Fallback to the Rankshoot apex (so sitemap/robots stay valid even if
 *      the env var is missing — override it in production).
 */
export const SITE_URL = (() => {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, '')}`;
  return 'https://rankshoot.com';
})();

/** Absolute URL for a path on the public site. */
export function absoluteUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${p}`;
}
