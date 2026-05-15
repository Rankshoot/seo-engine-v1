"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { brandFaviconUrl, brandSiteUrl, displayDomain, type StudioBrand } from "@/lib/studio-brand";

export interface StudioBrandMastheadProps {
  brand: StudioBrand;
  /** Visual density */
  size?: "sm" | "md";
  className?: string;
  /** Primary label color (e.g. ebook palette.text) */
  nameClassName?: string;
  /** Secondary / domain color */
  mutedClassName?: string;
  /** Border around favicon */
  borderColor?: string;
}

/**
 * Company name + domain + favicon — for ebook covers, chapter footers, whitepaper cover.
 */
export function StudioBrandMasthead({
  brand,
  size = "md",
  className,
  nameClassName,
  mutedClassName,
  borderColor,
}: StudioBrandMastheadProps) {
  const [imgOk, setImgOk] = useState(true);
  const fav = brandFaviconUrl(brand.domain);
  const site = brandSiteUrl(brand.domain);
  const host = displayDomain(brand.domain);

  const onImgError = useCallback(() => setImgOk(false), []);

  const imgPx = size === "sm" ? 28 : 36;

  return (
    <div className={cn("flex items-center gap-3 text-inherit", className)}>
      {fav && imgOk ? (
        <img
          src={fav}
          alt=""
          width={imgPx}
          height={imgPx}
          className="shrink-0 rounded-md object-contain"
          style={{
            borderWidth: 1,
            borderStyle: "solid",
            borderColor: borderColor ?? "var(--border-subtle)",
            background: "var(--surface-elevated, #fff)",
          }}
          onError={onImgError}
        />
      ) : (
        <div
          className="flex shrink-0 items-center justify-center rounded-md font-bold text-[11px] text-white"
          style={{
            width: imgPx,
            height: imgPx,
            background: "linear-gradient(135deg, #1863dc 0%, #0a66c2 100%)",
          }}
          aria-hidden
        >
          {(brand.company || "?").slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-semibold leading-tight text-inherit", nameClassName)}>
          {brand.company}
        </p>
        {host ? (
          <a
            href={site || undefined}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "mt-0.5 block truncate text-[12px] underline-offset-2 hover:underline text-inherit opacity-80",
              mutedClassName,
            )}
          >
            {host}
          </a>
        ) : null}
      </div>
    </div>
  );
}
