"use client";

import { useMemo, useState, useEffect } from "react";
import { projectDomainHost } from "@/lib/project-domain-host";

function logoUrlCandidates(host: string): string[] {
  if (!host) return [];
  return [
    `https://logo.clearbit.com/${encodeURIComponent(host)}`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(host)}.ico`,
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`,
  ];
}

export function DomainLogo({ domain }: { domain: string }) {
  const host = useMemo(() => projectDomainHost(domain), [domain]);
  const sources = useMemo(() => logoUrlCandidates(host), [host]);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setIndex(0);
    setFailed(false);
  }, [host]);

  const letter = (domain || "?").charAt(0).toUpperCase();

  if (!host || failed) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-surface-tertiary text-[14px] font-bold text-text-primary border border-border-subtle">
        {letter}
      </div>
    );
  }

  return (
    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-white border border-border-subtle shadow-sm">
      <img
        key={`${host}-${index}`}
        src={sources[index]}
        alt=""
        width={28}
        height={28}
        loading="lazy"
        decoding="async"
        className="h-7 w-7 object-contain"
        onError={() => {
          if (index < sources.length - 1) setIndex(i => i + 1);
          else setFailed(true);
        }}
      />
    </div>
  );
}
