"use client";

import React, { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";
import type {
  AnchorHTMLAttributes,
  ComponentType,
  HTMLAttributes,
  ImgHTMLAttributes,
  ReactNode,
} from "react";

/**
 * Long-form markdown renderer used by ebook + whitepaper previews.
 *
 * Mirrors the typography contract of the existing blog viewer (editorial
 * 17px body, 36px H1, generous spacing) so authors get a consistent
 * reading experience regardless of which content type they generated.
 *
 * Pulled out of `blogs/[blogId]/page.tsx` so the new content types reuse
 * the exact same rendering rules — link classification, image fallback,
 * code block styling, table chrome, etc.
 */

const V = {
  txt: "var(--text-primary)",
  txtSec: "var(--text-secondary)",
  txtMute: "var(--text-tertiary)",
  action: "var(--brand-action)",
  coral: "var(--brand-coral)",
  borderS: "var(--border-subtle)",
} as const;

/**
 * Explicit body/heading colors for markdown on **paper** (sepia, cream, white)
 * or other non-dashboard surfaces. Dashboard `text-text-*` tokens assume dark
 * chrome and read as light grey on a light page — use this in ebook/whitepaper readers.
 */
export interface LongFormReaderInk {
  primary: string;
  secondary: string;
  tertiary: string;
  border: string;
  /** Blockquote, fenced code, table header */
  surfaceMuted: string;
}

/** Extract YouTube video ID from various YouTube URL formats. */
function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/\/embed\/([^/?#]+)/);
      if (m) return m[1];
      const shorts = u.pathname.match(/\/shorts\/([^/?#]+)/);
      if (shorts) return shorts[1];
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id || null;
    }
  } catch {
    // not a valid URL
  }
  return null;
}

function safeUrl(url: string): string {
  const t = url.trim();
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(t)) return t;
  if (/^(https?:|mailto:|tel:)/i.test(t)) return t;
  if (t.startsWith("/") || t.startsWith("#")) return t;
  return "";
}

function flattenChildren(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenChildren).join("");
  return "";
}

function linkHostName(href: string): string | null {
  try {
    return new URL(href).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

interface MarkdownComponentsArgs {
  internalSet: Set<string>;
  ownSiteHost: string | null;
  readerInk?: LongFormReaderInk | null;
}

function buildComponents({ internalSet, ownSiteHost, readerInk }: MarkdownComponentsArgs): Components {
  const ink = readerInk ?? null;

  const Link: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement>> = ({ href = "", children, ...rest }) => {
    const isHttp = /^https?:\/\//i.test(href);
    const host = isHttp ? linkHostName(href) : null;
    const isOwnSite = Boolean(ownSiteHost && host && (host === ownSiteHost || host.endsWith(`.${ownSiteHost}`)));
    const isInternal = (!isHttp && href.startsWith("/")) || internalSet.has(href) || isOwnSite;
    const showExternalChrome = isHttp && !isOwnSite;
    const label = typeof children === "string" ? children : flattenChildren(children);
    return (
      <a
        href={href}
        target="_blank"
        rel={showExternalChrome ? "noopener noreferrer" : undefined}
        className="rounded-sm px-0.5 inline-flex items-baseline gap-0.5 underline underline-offset-[3px] transition-colors"
        style={{
          color: isInternal ? V.action : V.coral,
          textDecorationStyle: "dotted",
          textDecorationColor: "currentColor",
        }}
        {...rest}
      >
        {label}
        {showExternalChrome ? (
          <svg
            className="relative top-px inline h-3 w-3 opacity-60"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
            />
          </svg>
        ) : null}
      </a>
    );
  };

  const H1: ComponentType<HTMLAttributes<HTMLHeadingElement>> = ({ children, ...r }) => (
    <h1
      className={cn(!ink && "text-text-primary")}
      style={{
        marginTop: 40,
        marginBottom: 20,
        fontSize: 30,
        fontWeight: 800,
        lineHeight: 1.2,
        letterSpacing: -0.3,
        ...(ink ? { color: ink.primary } : {}),
      }}
      {...r}
    >
      {children}
    </h1>
  );
  const H2: ComponentType<HTMLAttributes<HTMLHeadingElement>> = ({ children, ...r }) => (
    <h2
      className={cn(!ink && "text-text-primary")}
      style={{
        marginTop: 48,
        marginBottom: 16,
        fontSize: 24,
        fontWeight: 800,
        lineHeight: 1.25,
        letterSpacing: -0.2,
        ...(ink ? { color: ink.primary } : {}),
      }}
      {...r}
    >
      {children}
    </h2>
  );
  const H3: ComponentType<HTMLAttributes<HTMLHeadingElement>> = ({ children, ...r }) => (
    <h3
      className={cn(!ink && "text-text-primary")}
      style={{ marginTop: 32, marginBottom: 12, fontSize: 18, fontWeight: 700, ...(ink ? { color: ink.primary } : {}) }}
      {...r}
    >
      {children}
    </h3>
  );
  const P: ComponentType<HTMLAttributes<HTMLParagraphElement>> = ({ children, ...r }) => (
    <p
      className={cn(!ink && "text-text-secondary")}
      style={{ fontSize: 17, lineHeight: 1.78, ...(ink ? { color: ink.secondary } : {}) }}
      {...r}
    >
      {children}
    </p>
  );
  const Strong: ComponentType<HTMLAttributes<HTMLElement>> = ({ children, ...r }) => (
    <strong className={cn("font-bold", !ink && "text-text-primary")} style={ink ? { color: ink.primary } : undefined} {...r}>
      {children}
    </strong>
  );
  const Em: ComponentType<HTMLAttributes<HTMLElement>> = ({ children, ...r }) => (
    <em className={cn("italic", !ink && "text-text-secondary")} style={ink ? { color: ink.secondary } : undefined} {...r}>
      {children}
    </em>
  );
  const UL: ComponentType<HTMLAttributes<HTMLUListElement>> = ({ children, ...r }) => (
    <ul className={cn("my-5 space-y-2 pl-6 list-disc", !ink && "text-text-secondary")} style={ink ? { color: ink.secondary } : undefined} {...r}>
      {children}
    </ul>
  );
  const OL: ComponentType<HTMLAttributes<HTMLOListElement>> = ({ children, ...r }) => (
    <ol className={cn("my-5 space-y-2 pl-6 list-decimal", !ink && "text-text-secondary")} style={ink ? { color: ink.secondary } : undefined} {...r}>
      {children}
    </ol>
  );
  const LI: ComponentType<HTMLAttributes<HTMLLIElement>> = ({ children, ...r }) => (
    <li
      className={cn("[&>p]:my-0!", !ink && "text-text-secondary")}
      style={{ fontSize: 17, lineHeight: 1.7, ...(ink ? { color: ink.secondary } : {}) }}
      {...r}
    >
      {children}
    </li>
  );
  const BQ: ComponentType<HTMLAttributes<HTMLQuoteElement>> = ({ children, ...r }) => (
    <blockquote
      className={cn(
        "my-6 rounded-r-[4px] pl-5 pr-4 py-4 italic [&>p]:my-0! border-l-2",
        !ink && "text-text-secondary border-text-tertiary bg-surface-secondary",
      )}
      style={{
        fontSize: 17,
        lineHeight: 1.7,
        ...(ink
          ? { color: ink.secondary, borderLeftColor: ink.border, backgroundColor: ink.surfaceMuted }
          : {}),
      }}
      {...r}
    >
      {children}
    </blockquote>
  );
  const Code: ComponentType<HTMLAttributes<HTMLElement> & { className?: string }> = ({
    children,
    className,
    ...r
  }) => {
    if (typeof className === "string" && /language-/i.test(className)) {
      return (
        <code
          className={cn(`${className} font-mono text-[13px]`, !ink && "text-text-secondary")}
          style={ink ? { color: ink.secondary } : undefined}
          {...r}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className={cn(
          "rounded-[4px] px-1.5 py-0.5 text-[0.85em] font-mono border",
          !ink && "bg-surface-secondary text-text-tertiary border-border-subtle",
        )}
        style={
          ink
            ? { color: ink.tertiary, backgroundColor: ink.surfaceMuted, borderColor: ink.border }
            : undefined
        }
        {...r}
      >
        {children}
      </code>
    );
  };
  const Pre: ComponentType<HTMLAttributes<HTMLPreElement>> = ({ children, ...r }) => {
    // Detect YouTube fenced block: ```youtube\nURL\n```
    const childrenArray = React.Children.toArray(children);
    const codeChild = childrenArray.find(
      (child): child is React.ReactElement<{ className?: string; children?: ReactNode }> => {
        if (!React.isValidElement(child)) return false;
        const props = child.props as any;
        return typeof props?.className === "string" && props.className.includes("language-youtube");
      }
    );

    if (codeChild) {
      const rawUrl = flattenChildren(codeChild.props.children).trim();
      const videoId = extractYouTubeId(rawUrl);
      if (videoId) {
        return (
          <div
            className="my-8 overflow-hidden rounded-[12px] border border-border-subtle"
            style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}
          >
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}`}
              title="YouTube video"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                border: 0,
              }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      }
    }
    return (
      <pre
        className={cn(
          "my-6 overflow-x-auto rounded-[8px] p-4 text-[13px] leading-relaxed border",
          !ink && "border-border-subtle bg-surface-secondary text-text-secondary",
        )}
        style={
          ink
            ? { color: ink.secondary, backgroundColor: ink.surfaceMuted, borderColor: ink.border }
            : undefined
        }
        {...r}
      >
        {children}
      </pre>
    );
  };
  const HR: ComponentType<HTMLAttributes<HTMLHRElement>> = p => (
    <hr className={cn("my-10 border-t", !ink && "border-border-subtle")} style={ink ? { borderColor: ink.border } : undefined} {...p} />
  );
  const Table: ComponentType<HTMLAttributes<HTMLTableElement>> = ({ children, ...r }) => (
    <div
      className={cn("my-6 overflow-x-auto rounded-[8px] border", !ink && "border-border-subtle")}
      style={ink ? { borderColor: ink.border } : undefined}
    >
      <table className="w-full border-collapse text-[14px]" {...r}>
        {children}
      </table>
    </div>
  );
  const THead: ComponentType<HTMLAttributes<HTMLTableSectionElement>> = ({ children, ...r }) => (
    <thead
      className={cn("text-left", !ink && "bg-surface-secondary text-text-tertiary")}
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        ...(ink ? { backgroundColor: ink.surfaceMuted, color: ink.tertiary } : {}),
      }}
      {...r}
    >
      {children}
    </thead>
  );
  const TR: ComponentType<HTMLAttributes<HTMLTableRowElement>> = ({ children, ...r }) => (
    <tr className={cn("border-t", !ink && "border-border-subtle")} style={ink ? { borderColor: ink.border } : undefined} {...r}>
      {children}
    </tr>
  );
  const TD: ComponentType<HTMLAttributes<HTMLTableCellElement>> = ({ children, ...r }) => (
    <td className={cn("px-4 py-2.5 align-top", !ink && "text-text-secondary")} style={ink ? { color: ink.secondary } : undefined} {...r}>
      {children}
    </td>
  );
  const TH: ComponentType<HTMLAttributes<HTMLTableCellElement>> = ({ children, ...r }) => (
    <th className="px-4 py-2.5 align-top" {...r}>
      {children}
    </th>
  );
  const Img: ComponentType<ImgHTMLAttributes<HTMLImageElement>> = ({ alt = "", src, ...r }) => {
    const safeSrc = typeof src === "string" ? safeUrl(src) : "";
    if (!safeSrc) {
      return null;
    }
    return (
      <span
        className={cn("my-8 block overflow-hidden rounded-[16px] border", !ink && "border-border-subtle")}
        style={ink ? { borderColor: ink.border } : undefined}
      >
        <img alt={alt} src={safeSrc} loading="lazy" className="aspect-video w-full object-cover" {...r} />
        {alt ? (
          <span
            className={cn("block px-4 py-2 text-[12px] border-t", !ink && "text-text-tertiary border-border-subtle")}
            style={ink ? { color: ink.tertiary, borderColor: ink.border } : undefined}
          >
            {alt}
          </span>
        ) : null}
      </span>
    );
  };

  return {
    a: Link,
    h1: H1,
    h2: H2,
    h3: H3,
    img: Img,
    p: P,
    strong: Strong,
    em: Em,
    ul: UL,
    ol: OL,
    li: LI,
    blockquote: BQ,
    code: Code,
    pre: Pre,
    hr: HR,
    table: Table,
    thead: THead,
    tr: TR,
    td: TD,
    th: TH,
  } as unknown as Components;
}

export interface LongFormMarkdownProps {
  markdown: string;
  /** URLs already classified as internal (server tags these so the renderer doesn't have to). */
  internalLinks?: string[];
  /** Bare hostname of the project's site (used to mark same-host absolute links as internal). */
  ownSiteHost?: string | null;
  className?: string;
  /**
   * When set, body/headings use these colors instead of dashboard `text-text-*`
   * tokens (required for sepia / light “paper” readers on a dark-themed app shell).
   */
  readerInk?: LongFormReaderInk | null;
}

export function LongFormMarkdown({
  markdown,
  internalLinks = [],
  ownSiteHost = null,
  className,
  readerInk = null,
}: LongFormMarkdownProps) {
  const internalSet = useMemo(() => new Set(internalLinks), [internalLinks]);
  const components = useMemo(
    () => buildComponents({ internalSet, ownSiteHost, readerInk }),
    [internalSet, ownSiteHost, readerInk],
  );
  return (
    <div
      className={cn("editorial-body space-y-5", !readerInk && "text-text-secondary", className)}
      style={{ fontSize: 17, lineHeight: 1.78, ...(readerInk ? { color: readerInk.secondary } : {}) }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={safeUrl}>
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

/** Strip the H1 line so previewers can render their own hero. */
export function stripHeroH1(markdown: string): { hero: string | null; body: string } {
  const match = markdown.match(/^\s*#\s+(.+)\s*$/m);
  if (!match) return { hero: null, body: markdown };
  return {
    hero: match[1].replace(/\*+/g, "").trim(),
    body: markdown.replace(match[0], "").replace(/^\n+/, ""),
  };
}
