import path from "node:path";
import type { NextConfig } from "next";

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.clerk.com https://*.clerk.accounts.dev https://js.stripe.com https://challenges.cloudflare.com;
  connect-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://*.supabase.co https://api.stripe.com https://vitals.vercel-insights.com https://vitals.vercel-analytics.com https://challenges.cloudflare.com;
  img-src 'self' data: blob: https://*.supabase.co https://logo.clearbit.com https://icons.duckduckgo.com https://www.google.com https://flagcdn.com https://img.clerk.com https://i.ytimg.com https://*.ytimg.com;
  style-src 'self' 'unsafe-inline';
  font-src 'self' data:;
  frame-src 'self' https://js.stripe.com https://*.clerk.com https://*.clerk.accounts.dev https://*.youtube.com https://youtube.com https://*.youtube-nocookie.com https://youtube-nocookie.com https://*.youtu.be https://youtu.be https://challenges.cloudflare.com;
  worker-src 'self' blob:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'self';
  upgrade-insecure-requests;
`.replace(/\s{2,}/g, ' ').trim();

/**
 * Deployment fingerprint, computed once per build. Doubles as the Next.js
 * buildId and is inlined into the client bundle (NEXT_PUBLIC_BUILD_ID) so the
 * running app can compare itself against `/api/version` and self-refresh when
 * a new deploy ships — users must never need a hard refresh to get updates.
 * Prefers the CI commit SHA (stable across build machines); falls back to a
 * per-build timestamp.
 */
const deployBuildId = (
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.GITHUB_SHA ||
  process.env.COMMIT_SHA ||
  process.env.SHORT_SHA ||
  Date.now().toString(36)
).slice(0, 12);

const nextConfig: NextConfig = {
  output: 'standalone',
  env: {
    NEXT_PUBLIC_BUILD_ID: deployBuildId,
  },
  generateBuildId: () => deployBuildId,
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
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "logo.clearbit.com" },
      { protocol: "https", hostname: "icons.duckduckgo.com" },
      { protocol: "https", hostname: "www.google.com" },
      { protocol: "https", hostname: "flagcdn.com" },
    ],
  },
  async headers() {
    return [
      {
        // App pages (no file extension, not Next internals, not API): the
        // HTML document must never be served from a stale cache — otherwise
        // users keep getting an old deploy until they hard-refresh. Hashed
        // /_next/static assets keep their immutable long-term caching.
        source: "/((?!_next/|api/|.*\\..*).*)",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
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
