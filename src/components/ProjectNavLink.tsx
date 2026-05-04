"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * In-app links under `/projects/...`.
 *
 * `prefetch={false}` stops Next.js from prefetching the **RSC flight** (`?_rsc=`)
 * on hover/viewport. Data for each screen still loads via `/api/v1/...` +
 * TanStack Query when you open the page — those are the requests to watch in
 * DevTools for JSON payloads.
 */
export function ProjectNavLink(props: ComponentProps<typeof Link>) {
  return <Link prefetch={false} {...props} />;
}
