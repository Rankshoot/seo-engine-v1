import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Pin Turbopack to this app folder so the "multiple lockfiles" warning
   *  stops firing in CI / local dev.
  turbopack: {
    root: path.resolve(__dirname),
  }, */
  experimental: {
    /** Instant Article custom uploads (base64) can approach 10 MB per file. */
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  /** Allow `logo.clearbit.com` etc. to load through <img> on the projects
   *  dashboard. Logos are decorative so no Image optimizer required. */
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "logo.clearbit.com" },
      { protocol: "https", hostname: "icons.duckduckgo.com" },
      { protocol: "https", hostname: "www.google.com" },
      { protocol: "https", hostname: "flagcdn.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
