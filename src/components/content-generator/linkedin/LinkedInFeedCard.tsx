"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const COLLAPSE_LIMIT = 1300;

export interface LinkedInFeedCardProps {
  authorName: string;
  authorHeadline: string;
  authorAvatarText?: string;
  /** Optional site favicon — shown instead of the gradient initial when it loads. */
  authorAvatarUrl?: string | null;
  /** Composed post body — the raw text the user will paste into LinkedIn. */
  postText: string;
  hashtags: string[];
  /** Single-image attachment (optional). Light/dark shell follows site `dark` class. */
  featuredImageUrl?: string | null;
  /**
   * When there is no image yet, reserve feed-style space for a future attachment.
   * Defaults to true in the studio so layout matches “post + image” before generation.
   */
  showMediaPlaceholder?: boolean;
  /** Only in preview mode — optional image is generated on demand, not with the copy. */
  allowGenerateImage?: boolean;
  onGenerateImage?: () => void;
  imageGenerating?: boolean;
  /** Show the post fully expanded (no "see more" collapse). Defaults to false. */
  expanded?: boolean;
  /** Compact variant for use inside the right rail or fullscreen previews. */
  variant?: "feed" | "compact";
  className?: string;
}

/**
 * Pixel-honest LinkedIn feed card.
 *
 * Mirrors the real LinkedIn post UI so the user sees exactly what their
 * audience will see when they paste it in:
 *   - 48px circular avatar with brand initial
 *   - 14px name, 12px headline, "1d · Edited" timestamp row
 *   - Body text with the 1,300-char "see more" collapse
 *   - Optional media row (1.91:1) — placeholder with “Generate image” in preview only
 *   - Light shell when the site is light; LinkedIn-dark shell when `html` has `dark`
 *   - Faux engagement counters (👍 ❤️ 💡 — N reactions · M comments)
 */
export function LinkedInFeedCard({
  authorName,
  authorHeadline,
  authorAvatarText,
  authorAvatarUrl,
  postText,
  hashtags,
  featuredImageUrl,
  showMediaPlaceholder = true,
  allowGenerateImage = false,
  onGenerateImage,
  imageGenerating = false,
  expanded = false,
  variant = "feed",
  className,
}: LinkedInFeedCardProps) {
  const [showMore, setShowMore] = useState(expanded);
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [authorAvatarUrl]);

  useEffect(() => {
    setShowMore(expanded);
  }, [expanded]);

  const truncated = !showMore && postText.length > COLLAPSE_LIMIT;
  const visibleText = truncated ? postText.slice(0, COLLAPSE_LIMIT) : postText;
  const initial = (authorAvatarText ?? authorName.charAt(0) ?? "S").toUpperCase();

  const imageSrc = (featuredImageUrl ?? "").trim();
  const showMediaRow = Boolean(imageSrc) || showMediaPlaceholder;

  return (
    <div
      className={cn(
        "rounded-lg border border-[#dadde1] bg-white text-[#000000E0] shadow-sm",
        "dark:border-[#2f3336] dark:bg-[#1d2226] dark:text-[#e7e9ea]",
        variant === "compact" ? "max-w-[460px]" : "max-w-[560px]",
        "mx-auto w-full",
        className,
      )}
    >
      {/* Author header */}
      <div className="flex items-start gap-3 px-4 pt-3 pb-2">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-[18px] font-semibold text-white"
          style={{
            background: authorAvatarUrl && !avatarFailed ? "transparent" : "linear-gradient(135deg, #0a66c2 0%, #0073b1 50%, #004d8c 100%)",
          }}
        >
          {authorAvatarUrl && !avatarFailed ? (
            <img
              src={authorAvatarUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setAvatarFailed(true)}
            />
          ) : (
            initial
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight truncate">{authorName}</p>
          <p className="text-[12px] leading-tight truncate text-[#00000099] dark:text-[#a8aaab]">
            {authorHeadline}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-[12px] text-[#00000099] dark:text-[#a8aaab]">
            <span>1d</span>
            <span>·</span>
            <span>Edited</span>
            <span>·</span>
            <GlobeIcon />
          </p>
        </div>
        <button
          type="button"
          className="rounded-full p-1 text-[#00000080] transition-colors hover:bg-[#0000000a] hover:text-[#000000e0] dark:text-[#a8aaab] dark:hover:bg-[#ffffff0a] dark:hover:text-[#e7e9ea]"
          aria-label="More"
        >
          <DotsIcon />
        </button>
      </div>

      {/* Post body */}
      <div className="px-4 pb-2 text-[14px] leading-[1.45]">
        <pre className="whitespace-pre-wrap wrap-break-word font-sans">
          {visibleText}
          {truncated ? "…  " : ""}
          {truncated ? (
            <button
              type="button"
              onClick={() => setShowMore(true)}
              className="ml-1 inline-flex font-semibold text-[#00000099] transition-colors hover:text-[#0a66c2] dark:text-[#a8aaab] dark:hover:text-[#70b5f9]"
            >
              …see more
            </button>
          ) : null}
        </pre>
        {hashtags.length > 0 && !truncated ? (
          <p className="mt-2 flex flex-wrap gap-x-1.5 gap-y-1">
            {hashtags.map((t, idx) => (
              <span
                key={`${t}-${idx}`}
                className="text-[14px] font-semibold text-[#0a66c2] dark:text-[#70b5f9]"
              >
                {t.startsWith("#") ? t : `#${t}`}
              </span>
            ))}
          </p>
        ) : null}
      </div>

      {/* Optional single image — LinkedIn-native slot (text above, media below) */}
      {showMediaRow ? (
        <div className="px-4 pb-2">
          {imageSrc ? (
            <div
              className="max-h-[min(360px,52vh)] w-full overflow-hidden rounded-md border border-[#00000014] dark:border-[#ffffff18]"
              style={{ aspectRatio: "1.91 / 1" }}
            >
              <img src={imageSrc} alt="" className="h-full w-full object-cover" loading="lazy" />
            </div>
          ) : (
            <div
              className="relative w-full max-h-[min(360px,52vh)] overflow-hidden rounded-md border border-dashed border-[#00000033] bg-[#f3f2ef] dark:border-[#ffffff38] dark:bg-[#2a2f34]"
              style={{ aspectRatio: "1.91 / 1" }}
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
                <p className="text-[12px] font-medium leading-snug text-[#00000099] dark:text-[#a8aaab]">
                  Image attachment (optional)
                </p>
                {allowGenerateImage && typeof onGenerateImage === "function" ? (
                  <button
                    type="button"
                    disabled={imageGenerating}
                    onClick={onGenerateImage}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#0a66c2] bg-transparent px-4 py-2 text-[13px] font-semibold text-[#0a66c2] transition-colors hover:bg-[#0a66c2]/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#70b5f9] dark:text-[#70b5f9] dark:hover:bg-[#70b5f9]/10"
                  >
                    {imageGenerating ? (
                      <>
                        <span
                          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                          aria-hidden
                        />
                        Generating…
                      </>
                    ) : (
                      "Generate image"
                    )}
                  </button>
                ) : (
                  <p className="max-w-[280px] text-[11px] leading-relaxed text-[#00000080] dark:text-[#8b8d8f]">
                    Stay in <span className="font-semibold text-[#000000b3] dark:text-[#c9cccf]">Preview</span> to add
                    an image when generation is available.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Reaction count strip */}
      <div className="flex items-center justify-between px-4 pb-2 text-[12px] text-[#00000099] dark:text-[#a8aaab]">
        <div className="flex items-center gap-1">
          <ReactionStack />
          <span>{computeFakeReactions(postText)} · {computeFakeComments(postText)} comments</span>
        </div>
        <span>{computeFakeReposts(postText)} reposts</span>
      </div>

      {/* Action bar */}
      <div className="grid grid-cols-4 gap-1 border-t border-[#0000000d] px-2 py-1 dark:border-[#ffffff14]">
        {ACTIONS.map(a => (
          <button
            key={a.label}
            type="button"
            className="flex items-center justify-center gap-1.5 rounded-md px-2 py-2.5 text-[13px] font-semibold text-[#00000099] transition-colors hover:bg-[#0000000a] dark:text-[#a8aaab] dark:hover:bg-[#ffffff0a]"
          >
            <span className="h-4 w-4">{a.icon}</span>
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg className="h-3.5 w-3.5 inline" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 1a7 7 0 1 1 0 14A7 7 0 0 1 8 1zm0 12.5c.65 0 1.42-.62 1.97-1.95.21-.5.39-1.07.5-1.7H5.53c.11.63.29 1.2.5 1.7.55 1.33 1.32 1.95 1.97 1.95zm-2.6-5.15h5.2A8.4 8.4 0 0 0 10.6 6h-5.2c-.07.4-.07.85 0 1.35zm5.07-2.85a4.4 4.4 0 0 0-.5-1.2C9.42 3.12 8.65 2.5 8 2.5s-1.42.62-1.97 1.8a4.4 4.4 0 0 0-.5 1.2zm.83.85h2.05a5.5 5.5 0 0 0-2.32-2.5c.13.45.21.95.27 1.5zM2.65 6.85h1.85c.06-.55.14-1.05.27-1.5A5.5 5.5 0 0 0 2.65 6.85zm0 2.85a5.5 5.5 0 0 0 2.12 2.62c-.13-.45-.21-.95-.27-1.5H2.65zm8.85 0c-.06.55-.14 1.05-.27 1.5a5.5 5.5 0 0 0 2.12-2.62z" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
    </svg>
  );
}

function ReactionStack() {
  return (
    <span className="inline-flex items-center -space-x-1">
      <Bubble color="#0a66c2">👍</Bubble>
      <Bubble color="#df704d">❤</Bubble>
      <Bubble color="#f5b800">💡</Bubble>
    </span>
  );
}

function Bubble({ color, children }: { color: string; children: string }) {
  return (
    <span
      className="inline-flex h-4 w-4 items-center justify-center rounded-full ring-2 ring-white text-[8px] dark:ring-[#1d2226]"
      style={{ background: color }}
    >
      <span className="block leading-none">{children}</span>
    </span>
  );
}

const ACTIONS = [
  {
    label: "Like",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M19.6 12.6c0-.7-.6-1.3-1.3-1.3h-3.7c-.4 0-.7-.4-.6-.8l.7-3.4c.2-.7-.1-1.4-.6-1.7l-1.4-.7c-.5-.3-1.1-.1-1.4.4L8.4 9.7c-.2.3-.6.5-.9.5h-2c-.5 0-1 .4-1 1v6.6c0 .5.4 1 1 1h2.4c.4 0 .7.2.9.5l1 1.4c.3.4.7.6 1.2.6h6.4c.6 0 1.1-.4 1.2-.9l1.6-5.8c.4-.5.4-1.1.4-1z" />
      </svg>
    ),
  },
  {
    label: "Comment",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M7 9h10v2H7zM7 12h7v2H7z" />
        <path d="M21 4H3a1 1 0 0 0-1 1v15a1 1 0 0 0 1.6.8l3.4-2.5a2 2 0 0 1 1.2-.4H21a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm-1 12H8.2c-.7 0-1.5.2-2.1.7L4 18V6h16z" />
      </svg>
    ),
  },
  {
    label: "Repost",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M14 13l4-4-4-4v3H4v2h10v3zm-4 4v-3l-4 4 4 4v-3h10v-2H10z" />
      </svg>
    ),
  },
  {
    label: "Send",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="m20.7 11.3-9.5-9.4c-.6-.6-1.6-.2-1.6.6V8H4c-.6 0-1 .4-1 1v6c0 .6.4 1 1 1h5.6v5.5c0 .8 1 1.2 1.6.6l9.5-9.4c.4-.4.4-1 0-1.4z" />
      </svg>
    ),
  },
] as const;

// ─── Faux engagement (deterministic, char-count-derived) ─────────────────

function hashSeed(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function computeFakeReactions(text: string): string {
  const base = 80 + (hashSeed(text) % 920);
  return base.toLocaleString();
}
function computeFakeComments(text: string): number {
  return 4 + (hashSeed(text + "c") % 24);
}
function computeFakeReposts(text: string): number {
  return 1 + (hashSeed(text + "r") % 12);
}
