import path from "node:path";
import type { NextConfig } from "next";

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.clerk.com https://*.clerk.accounts.dev https://js.stripe.com https://challenges.cloudflare.com;
  connect-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://*.supabase.co https://api.stripe.com https://vitals.vercel-insights.com https://vitals.vercel-analytics.com https://challenges.cloudflare.com;
  img-src 'self' data: blob: https://logo.clearbit.com https://icons.duckduckgo.com https://www.google.com https://flagcdn.com https://img.clerk.com https://i.ytimg.com https://*.ytimg.com;
  style-src 'self' 'unsafe-inline';
  font-src 'self' data:;
  frame-src 'self' https://js.stripe.com https://*.clerk.com https://*.clerk.accounts.dev https://*.youtube.com https://youtube.com https://*.youtube-nocookie.com https://youtube-nocookie.com https://*.youtu.be https://youtu.be https://challenges.cloudflare.com;
  worker-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, ' ').trim();

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.resolve(__dirname),
  },
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
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
