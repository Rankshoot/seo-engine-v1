/**
 * Markdown rendering utilities for the blog viewer.
 *
 * Extracted from blogs/[blogId]/page.tsx so the main page stays focused on
 * routing + state, while this module owns all markdown-to-DOM concerns.
 */
import {
  type ComponentType,
  type AnchorHTMLAttributes,
  type ChangeEvent,
  type HTMLAttributes,
  type ImgHTMLAttributes,
  type ReactNode,
  type ReactElement,
  isValidElement,
  Children,
  useState,
} from "react";
import { BLOG_IMAGE_PLACEHOLDER_URL } from "@/services/openAiImages";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Blog } from "@/lib/types";

// ─── Public utilities ──────────────────────────────────────────────────────

export function internalSetForBlog(blog: Blog): Set<string> {
  return new Set(blog.internal_links ?? []);
}

export function stripHeroHeading(blog: Blog): { heroTitle: string; body: string } {
  const h1 = blog.content.match(/^\s*#\s+(.+)\s*$/m);
  if (!h1) return { heroTitle: blog.title, body: blog.content };
  return {
    heroTitle: h1[1].replace(/\*+/g, "").trim(),
    body: blog.content.replace(h1[0], "").replace(/^\n+/, ""),
  };
}

export function markdownUrlTransform(url: string): string {
  const t = url.trim();
  if (/^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(t)) return t;
  if (/^data:image\/svg\+xml;[a-z0-9;=,-]+,[\s\S]+$/i.test(t)) return t;
  if (/^(https?:|mailto:|tel:)/i.test(t)) return t;
  if (t.startsWith("/") || t.startsWith("#")) return t;
  return "";
}

export function flattenChildren(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenChildren).join("");
  return "";
}

export function extractYouTubeId(url: string): string | null {
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

// ─── Placeholder image card (interactive, requires hooks) ─────────────────

export interface ImageGenOptions {
  onGenerate: (alt: string) => Promise<boolean>;
  onUpload?: (alt: string, dataUrl: string) => Promise<boolean>;
}

function PlaceholderImageCard({
  alt,
  onGenerate,
  onUpload,
}: {
  alt: string;
  onGenerate: (alt: string) => Promise<boolean>;
  onUpload?: (alt: string, dataUrl: string) => Promise<boolean>;
}) {
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"generate" | "upload" | null>(null);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    setLoading(true);
    setAction("generate");
    setError("");
    const ok = await onGenerate(alt);
    setLoading(false);
    setAction(null);
    if (!ok) setError("Generation failed. Try again.");
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onUpload) return;
    setLoading(true);
    setAction("upload");
    setError("");
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) { setLoading(false); setAction(null); setError("Could not read file."); return; }
      const ok = await onUpload(alt, dataUrl);
      setLoading(false);
      setAction(null);
      if (!ok) setError("Upload failed. Try again.");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <span className="my-8 block overflow-hidden rounded-[16px] border-2 border-dashed border-border-subtle">
      <span className="flex aspect-video flex-col items-center justify-center gap-4 bg-surface-secondary px-6">
        <svg className="h-10 w-10 text-text-tertiary opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
          <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="8.5" cy="8.5" r="1.5" strokeLinecap="round" />
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 15-5-5L5 21" />
        </svg>
        <span className="text-[13px] text-text-tertiary">Image placeholder</span>
        <span className="flex items-center gap-2">
          {/* Generate with AI */}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2 text-[13px] font-semibold transition-all disabled:opacity-50"
            style={{ background: "var(--brand-action)", color: "#fff" }}
          >
            {loading && action === "generate" ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Generating…
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Generate Image
              </>
            )}
          </button>

          {/* Upload from device */}
          {onUpload && (
            <label
              className={[
                "inline-flex cursor-pointer items-center gap-2 rounded-full border border-border-subtle bg-surface-primary px-5 py-2 text-[13px] font-semibold transition-all",
                loading ? "pointer-events-none opacity-50" : "hover:border-border-default hover:bg-surface-hover",
              ].join(" ")}
              style={{ color: "var(--text-secondary)" }}
            >
              {loading && action === "upload" ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Uploading…
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Upload Image
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                disabled={loading}
              />
            </label>
          )}
        </span>
        {error && (
          <span className="text-[11px] text-rose-500">{error}</span>
        )}
      </span>
      {alt && (
        <span className="block px-4 py-2 text-[12px] text-text-tertiary border-t border-border-subtle">
          {alt}
        </span>
      )}
    </span>
  );
}

// ─── PDF link card ────────────────────────────────────────────────────────

/** Returns true if the URL likely points to a PDF document. */
function isPdfHref(href: string): boolean {
  try {
    const u = new URL(href);
    const path = u.pathname.toLowerCase();
    if (path.endsWith(".pdf")) return true;
    if (u.searchParams.get("filetype") === "pdf") return true;
    if (u.searchParams.get("type") === "pdf") return true;
  } catch { /* relative or invalid URL — not a PDF */ }
  return /\.pdf(\?|#|$)/i.test(href);
}

function PdfLinkCard({ href, label }: { href: string; label: string }) {
  const filename = (() => {
    try { return decodeURIComponent(new URL(href).pathname.split("/").filter(Boolean).pop() ?? "document.pdf"); }
    catch { return label || "document.pdf"; }
  })();

  return (
    <span className="my-4 flex items-center gap-3 rounded-[12px] border border-rose-500/20 bg-rose-500/5 px-4 py-3 not-italic no-underline">
      {/* PDF icon */}
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-rose-500/10">
        <svg className="h-5 w-5 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" />
        </svg>
      </span>

      {/* Filename */}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-text-primary">{label || filename}</span>
        <span className="block text-[11px] text-text-tertiary">PDF Document</span>
      </span>

      {/* Actions */}
      <span className="flex items-center gap-2 shrink-0">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 items-center gap-1.5 rounded-[8px] bg-rose-500/10 px-3 text-[12px] font-medium text-rose-400 hover:bg-rose-500/20 transition-colors"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
          </svg>
          View
        </a>
        <a
          href={href}
          download
          className="flex h-8 items-center gap-1.5 rounded-[8px] border border-border-subtle bg-surface-secondary px-3 text-[12px] font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Download
        </a>
      </span>
    </span>
  );
}

// ─── Markdown component builder ────────────────────────────────────────────

function linkHostName(href: string): string | null {
  try {
    return new URL(href).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function buildMarkdownComponents(
  internalSet: Set<string>,
  ownSiteHost: string | null = null,
  imageGenOptions?: ImageGenOptions
): Components {
  const MarkdownLink: ComponentType<AnchorHTMLAttributes<HTMLAnchorElement>> = ({
    href = "",
    children,
    ...rest
  }) => {
    const isHttp = /^https?:\/\//i.test(href);
    const label = typeof children === "string" ? children : flattenChildren(children);

    // Render PDF links as a download card instead of an inline text link.
    if (isHttp && isPdfHref(href)) {
      return <PdfLinkCard href={href} label={label} />;
    }

    const host = isHttp ? linkHostName(href) : null;
    const isOwnSite = Boolean(
      ownSiteHost && host && (host === ownSiteHost || host.endsWith(`.${ownSiteHost}`))
    );
    const isInternal = (!isHttp && href.startsWith("/")) || internalSet.has(href) || isOwnSite;
    const showExternalChrome = isHttp && !isOwnSite;
    return (
      <a
        href={href}
        target="_blank"
        rel={showExternalChrome ? "noopener noreferrer" : undefined}
        className="underline underline-offset-[3px] transition-colors rounded-sm px-0.5 inline-flex items-baseline gap-0.5"
        style={{
          color: isInternal ? "var(--brand-action)" : "var(--brand-coral)",
          textDecorationStyle: "dotted",
          textDecorationColor: "currentColor",
        }}
        {...rest}
      >
        {label}
        {showExternalChrome && (
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
        )}
      </a>
    );
  };

  const H1: ComponentType<HTMLAttributes<HTMLHeadingElement>> = ({ children, ...r }) => (
    <h1 className="text-text-primary" style={{ marginTop: 40, marginBottom: 20, fontSize: 30, fontWeight: 800, lineHeight: 1.2, letterSpacing: -0.3 }} {...r}>{children}</h1>
  );
  const H2: ComponentType<HTMLAttributes<HTMLHeadingElement>> = ({ children, ...r }) => (
    <h2 className="text-text-primary" style={{ marginTop: 48, marginBottom: 16, fontSize: 24, fontWeight: 800, lineHeight: 1.25, letterSpacing: -0.2 }} {...r}>{children}</h2>
  );
  const H3: ComponentType<HTMLAttributes<HTMLHeadingElement>> = ({ children, ...r }) => (
    <h3 className="text-text-primary" style={{ marginTop: 32, marginBottom: 12, fontSize: 18, fontWeight: 700 }} {...r}>{children}</h3>
  );
  const P: ComponentType<HTMLAttributes<HTMLParagraphElement>> = ({ children, ...r }) => (
    <p className="text-text-secondary" style={{ fontSize: 17, lineHeight: 1.78 }} {...r}>{children}</p>
  );
  const Strong: ComponentType<HTMLAttributes<HTMLElement>> = ({ children, ...r }) => (
    <strong className="font-bold text-text-primary" {...r}>{children}</strong>
  );
  const Em: ComponentType<HTMLAttributes<HTMLElement>> = ({ children, ...r }) => (
    <em className="italic text-text-secondary" {...r}>{children}</em>
  );
  const UL: ComponentType<HTMLAttributes<HTMLUListElement>> = ({ children, ...r }) => (
    <ul className="my-5 space-y-2 pl-6 list-disc text-text-secondary" {...r}>{children}</ul>
  );
  const OL: ComponentType<HTMLAttributes<HTMLOListElement>> = ({ children, ...r }) => (
    <ol className="my-5 space-y-2 pl-6 list-decimal text-text-secondary" {...r}>{children}</ol>
  );
  const LI: ComponentType<HTMLAttributes<HTMLLIElement>> = ({ children, ...r }) => (
    <li className="text-text-secondary [&>p]:my-0!" style={{ fontSize: 17, lineHeight: 1.7 }} {...r}>{children}</li>
  );
  const BQ: ComponentType<HTMLAttributes<HTMLQuoteElement>> = ({ children, ...r }) => (
    <blockquote
      className="my-6 rounded-r-[4px] pl-5 pr-4 py-4 italic text-text-secondary [&>p]:my-0! border-l-2 border-text-tertiary bg-surface-secondary"
      style={{ fontSize: 17, lineHeight: 1.7 }}
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
    if (typeof className === "string" && /language-/i.test(className))
      return <code className={`${className} font-mono text-[13px] text-text-secondary`} {...r}>{children}</code>;
    return (
      <code className="rounded-[4px] px-1.5 py-0.5 text-[0.85em] font-mono bg-surface-secondary text-text-tertiary border border-border-subtle" {...r}>
        {children}
      </code>
    );
  };
  const Pre: ComponentType<HTMLAttributes<HTMLPreElement>> = ({ children, ...r }) => {
    const childrenArray = Children.toArray(children);
    const codeChild = childrenArray.find(
      (child): child is ReactElement<{ className?: string; children?: ReactNode }> => {
        if (!isValidElement(child)) return false;
        const props = child.props as { className?: string };
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
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        );
      }
    }
    return (
      <pre
        className="my-6 overflow-x-auto rounded-[8px] p-4 text-[13px] leading-relaxed border border-border-subtle bg-surface-secondary text-text-secondary"
        {...r}
      >
        {children}
      </pre>
    );
  };
  const HR: ComponentType<HTMLAttributes<HTMLHRElement>> = (p) => (
    <hr className="my-10 border-t border-border-subtle" {...p} />
  );
  const Table: ComponentType<HTMLAttributes<HTMLTableElement>> = ({ children, ...r }) => (
    <div className="my-6 overflow-x-auto rounded-[8px] border border-border-subtle">
      <table className="w-full border-collapse text-[14px]" {...r}>{children}</table>
    </div>
  );
  const THead: ComponentType<HTMLAttributes<HTMLTableSectionElement>> = ({ children, ...r }) => (
    <thead
      className="text-left bg-surface-secondary text-text-tertiary"
      style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}
      {...r}
    >
      {children}
    </thead>
  );
  const TR: ComponentType<HTMLAttributes<HTMLTableRowElement>> = ({ children, ...r }) => (
    <tr className="border-t border-border-subtle" {...r}>{children}</tr>
  );
  const TD: ComponentType<HTMLAttributes<HTMLTableCellElement>> = ({ children, ...r }) => (
    <td className="px-4 py-2.5 align-top text-text-secondary" {...r}>{children}</td>
  );
  const TH: ComponentType<HTMLAttributes<HTMLTableCellElement>> = ({ children, ...r }) => (
    <th className="px-4 py-2.5 align-top" {...r}>{children}</th>
  );
  const Img: ComponentType<ImgHTMLAttributes<HTMLImageElement>> = ({ alt = "", src }) => {
    const rawSrc = typeof src === "string" ? src : "";

    // Show interactive placeholder card when image is a placeholder and handler is available
    if (rawSrc === BLOG_IMAGE_PLACEHOLDER_URL && imageGenOptions) {
      return (
        <PlaceholderImageCard
          alt={alt}
          onGenerate={imageGenOptions.onGenerate}
          onUpload={imageGenOptions.onUpload}
        />
      );
    }

    // Static placeholder (no handler — e.g. in edit mode or static rendering)
    if (rawSrc === BLOG_IMAGE_PLACEHOLDER_URL) {
      return (
        <span className="my-8 block overflow-hidden rounded-[16px] border-2 border-dashed border-border-subtle">
          <span className="flex aspect-video flex-col items-center justify-center gap-3 bg-surface-secondary">
            <svg className="h-8 w-8 text-text-tertiary opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
              <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="8.5" cy="8.5" r="1.5" strokeLinecap="round" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 15-5-5L5 21" />
            </svg>
            <span className="text-[12px] text-text-tertiary">Image not generated</span>
          </span>
          {alt && (
            <span className="block px-4 py-2 text-[12px] text-text-tertiary border-t border-border-subtle">
              {alt}
            </span>
          )}
        </span>
      );
    }

    const safeSrc = markdownUrlTransform(rawSrc);
    if (!safeSrc) return null;
    return (
      <span className="my-8 block overflow-hidden rounded-[16px] border border-border-subtle">
        <img alt={alt} src={safeSrc} loading="lazy" className="aspect-video w-full object-cover" />
        {alt && (
          <span className="block px-4 py-2 text-[12px] text-text-tertiary border-t border-border-subtle">
            {alt}
          </span>
        )}
      </span>
    );
  };

  return {
    a: MarkdownLink,
    h1: H1, h2: H2, h3: H3,
    img: Img, p: P,
    strong: Strong, em: Em,
    ul: UL, ol: OL, li: LI,
    blockquote: BQ, code: Code, pre: Pre, hr: HR,
    table: Table, thead: THead, tr: TR, td: TD, th: TH,
  } as unknown as Components;
}

// ─── Server-side rendering helpers (used in the blog editor) ──────────────

export function markdownBodyToHtml(
  markdown: string,
  internalSet: Set<string>,
  ownSiteHost: string | null
): string {
  return renderToStaticMarkup(
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={buildMarkdownComponents(internalSet, ownSiteHost)}
      urlTransform={markdownUrlTransform}
    >
      {markdown}
    </ReactMarkdown>
  );
}

export function markdownAiSnippetToDocumentFragment(
  markdown: string,
  blog: Blog,
  doc: Document,
  ownSiteHost: string | null
): DocumentFragment {
  const internalSet = internalSetForBlog(blog);
  const html = renderToStaticMarkup(
    <div className="text-text-secondary" style={{ fontSize: 17, lineHeight: 1.78 }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={buildMarkdownComponents(internalSet, ownSiteHost)}
        urlTransform={markdownUrlTransform}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const wrapper = parsed.body.firstElementChild;
  const frag = doc.createDocumentFragment();
  if (!wrapper) {
    frag.appendChild(doc.createTextNode(markdown));
    return frag;
  }
  while (wrapper.firstChild) {
    const next = wrapper.firstChild;
    frag.appendChild(doc.importNode(next, true));
    wrapper.removeChild(next);
  }
  if (!frag.childNodes.length) frag.appendChild(doc.createTextNode(markdown));
  return frag;
}
