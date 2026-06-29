import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Keep the app, auth, and API surfaces out of the index — only public
        // marketing + blog pages should be crawled.
        disallow: ["/projects", "/admin", "/api/", "/sign-in", "/sign-up", "/dashboard"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
