import type { MetadataRoute } from "next";
import { strapiClient } from "@/services/strapi/client";
import { absoluteUrl, SITE_URL } from "@/lib/site-url";

// Re-generate hourly so newly published posts appear without a redeploy.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/blog"), lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/pricing"), changeFrequency: "monthly", priority: 0.6 },
  ];

  if (!strapiClient.isConfigured()) return staticEntries;

  try {
    const res = await strapiClient.listArticles({ pageSize: 1000 });
    const posts: MetadataRoute.Sitemap = res.data.map(a => ({
      url: absoluteUrl(`/blog/${a.slug}`),
      lastModified: new Date(a.updatedAt || a.publishedAt || Date.now()),
      changeFrequency: "weekly",
      priority: 0.7,
    }));
    return [...staticEntries, ...posts];
  } catch {
    return staticEntries;
  }
}
