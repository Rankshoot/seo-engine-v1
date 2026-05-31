"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * In-app links under `/projects/...`.
 *
 * By default `prefetch={false}` stops Next.js from prefetching the RSC flight
 * on hover/viewport. Data for each screen loads via `/api/v1/...` + TanStack
 * Query when you open the page.
 *
 * For sidebar navigation links, pass `enablePrefetch` to let Next.js preload
 * the JS bundle + RSC payload on hover, eliminating the "compiling" step on
 * click — the biggest contributor to sluggish page transitions.
 */
export function ProjectNavLink({
  enablePrefetch,
  ...props
}: ComponentProps<typeof Link> & { enablePrefetch?: boolean }) {
  return <Link prefetch={enablePrefetch ? undefined : false} {...props} />;
}
