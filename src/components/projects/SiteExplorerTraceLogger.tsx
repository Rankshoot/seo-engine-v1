"use client";

import { useEffect } from "react";
import type { SiteExplorerTraceEntry } from "@/app/actions/project-actions";

export default function SiteExplorerTraceLogger({ trace }: { trace: SiteExplorerTraceEntry[] }) {
  useEffect(() => {
    // trace logging disabled in production
    // if (trace.length) console.log("[siteExplorer]", trace);
  }, [trace]);
  return null;
}
