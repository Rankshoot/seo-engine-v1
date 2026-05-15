/**
 * Shared “studio” branding helpers — company + domain for previews and print/PDF.
 * Project rows do not store a logo URL; we derive a favicon from the apex domain.
 */

export interface StudioBrand {
  company: string;
  domain: string;
}

export function displayDomain(domain: string): string {
  return domain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").trim();
}

/** Public favicon lookup (no API key). Returns null if domain is empty/invalid. */
export function brandFaviconUrl(domain: string): string | null {
  const host = displayDomain(domain);
  if (!host || !/^[\w.-]+$/.test(host)) return null;
  return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(host)}`;
}

export function brandSiteUrl(domain: string): string {
  const host = displayDomain(domain);
  if (!host) return "";
  return `https://${host}`;
}
