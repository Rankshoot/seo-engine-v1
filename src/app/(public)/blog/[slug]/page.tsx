import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { strapiClient } from "@/services/strapi/client";
import type { NormalisedArticle } from "@/services/strapi/types";
import { ArticleJsonLd } from "@/components/blog/ArticleJsonLd";
import { TableOfContents } from "@/components/blog/TableOfContents";
import {
  createSlugAssigner,
  extractHeadings,
  formatBlogDate,
  readingTime,
  relatednessScore,
} from "@/components/blog/blog-format";
import { absoluteUrl } from "@/lib/site-url";

export const revalidate = 300;

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  if (!strapiClient.isConfigured()) return {};
  const { slug } = await params;
  try {
    const article = await strapiClient.getArticleBySlug(slug);
    if (!article) return { title: "Not Found" };
    const url = absoluteUrl(`/blog/${slug}`);
    const description = article.meta_description || article.excerpt;
    return {
      title: `${article.title} | Rankshoot`,
      description,
      alternates: { canonical: url },
      openGraph: {
        title: article.title,
        description,
        type: "article",
        url,
        publishedTime: article.publishedAt ?? undefined,
        images: article.cover_image_url
          ? [{ url: article.cover_image_url, width: 1200, height: 630, alt: article.title }]
          : [],
      },
      twitter: {
        card: "summary_large_image",
        title: article.title,
        description,
        images: article.cover_image_url ? [article.cover_image_url] : [],
      },
    };
  } catch {
    return {};
  }
}

/** Flatten a React node tree to its text — used to derive heading anchor ids. */
function nodeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (typeof node === "object" && "props" in (node as { props?: { children?: ReactNode } })) {
    return nodeText((node as { props?: { children?: ReactNode } }).props?.children);
  }
  return "";
}

export default async function BlogPostPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!strapiClient.isConfigured()) notFound();

  const { slug } = await params;
  const article = await strapiClient.getArticleBySlug(slug).catch(() => null);
  if (!article) notFound();

  const url = absoluteUrl(`/blog/${slug}`);
  const headings = extractHeadings(article.content);

  // Related posts — cheap lexical relatedness, no extra API cost.
  let related: NormalisedArticle[] = [];
  try {
    const res = await strapiClient.listArticles({ pageSize: 12 });
    related = res.data
      .filter(a => a.slug !== slug)
      .map(a => ({ a, score: relatednessScore(article.target_keyword, article.title, a.target_keyword, a.title) }))
      .sort((x, y) => y.score - x.score)
      .slice(0, 3)
      .map(x => x.a);
  } catch {
    /* related posts are best-effort */
  }

  // Shared, document-order slug assigner so rendered heading ids match the TOC.
  const assign = createSlugAssigner();
  const mdComponents = {
    h2: ({ children }: { children?: ReactNode }) => (
      <h2 id={assign(nodeText(children))} className="scroll-mt-28">{children}</h2>
    ),
    h3: ({ children }: { children?: ReactNode }) => (
      <h3 id={assign(nodeText(children))} className="scroll-mt-28">{children}</h3>
    ),
  };

  return (
    <>
      <ArticleJsonLd article={article} url={url} />

      <article className="pb-8">
        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <header className="mx-auto max-w-5xl px-6">
          <Link
            href="/blog"
            className="group mb-6 inline-flex items-center gap-1.5 text-[12px] text-text-tertiary transition-colors hover:text-text-secondary"
          >
            <svg className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 8H3M7 4l-4 4 4 4" />
            </svg>
            All posts
          </Link>

          <div className="relative overflow-hidden rounded-3xl border border-border-subtle">
            {article.cover_image_url ? (
              <img src={article.cover_image_url} alt={article.title} className="h-[clamp(320px,48vh,560px)] w-full object-cover" />
            ) : (
              <div className="h-[clamp(280px,40vh,460px)] w-full bg-gradient-to-br from-brand-violet/30 via-surface-secondary to-brand-aqua/20" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
              <div className="mx-auto max-w-4xl">
                {article.target_keyword && (
                  <span className="mb-4 inline-flex items-center rounded-full border border-white/25 bg-white/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-white backdrop-blur-sm">
                    {article.target_keyword}
                  </span>
                )}
                <h1 className="text-balance text-[30px] font-bold leading-[1.12] tracking-tight text-white drop-shadow-sm sm:text-[46px]">
                  {article.title}
                </h1>
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-white/85">
                  <span className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-brand-violet to-brand-aqua text-[10px] font-bold text-white">R</span>
                    Rankshoot Team
                  </span>
                  {article.publishedAt && (
                    <>
                      <span className="h-1 w-1 rounded-full bg-white/40" />
                      <time dateTime={article.publishedAt}>{formatBlogDate(article.publishedAt)}</time>
                    </>
                  )}
                  {article.word_count ? (
                    <>
                      <span className="h-1 w-1 rounded-full bg-white/40" />
                      <span>{readingTime(article.word_count)}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ── Body + TOC ──────────────────────────────────────────────────── */}
        <div className="mx-auto mt-12 max-w-5xl px-6">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-12">
            <div
              className="prose prose-neutral max-w-none dark:prose-invert
                prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-text-primary
                prose-h2:text-[26px] prose-h2:mt-12 prose-h2:mb-4
                prose-h3:text-[19px] prose-h3:mt-8 prose-h3:mb-3
                prose-p:text-text-secondary prose-p:leading-[1.85] prose-p:text-[16.5px]
                prose-a:text-brand-violet prose-a:font-medium prose-a:no-underline hover:prose-a:underline
                prose-strong:text-text-primary prose-strong:font-semibold
                prose-code:text-[13px] prose-code:bg-surface-secondary prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-[4px] prose-code:border prose-code:border-border-subtle prose-code:text-text-primary prose-code:before:content-none prose-code:after:content-none
                prose-pre:bg-surface-secondary prose-pre:border prose-pre:border-border-subtle prose-pre:rounded-xl prose-pre:text-[13px]
                prose-blockquote:border-l-brand-violet prose-blockquote:text-text-secondary prose-blockquote:not-italic
                prose-ul:text-text-secondary prose-ol:text-text-secondary
                prose-li:text-[15.5px] prose-li:leading-relaxed
                prose-table:text-[14px] prose-th:text-text-primary
                prose-img:rounded-xl prose-img:border prose-img:border-border-subtle prose-img:shadow-sm
                prose-hr:border-border-subtle prose-hr:my-10"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {article.content}
              </ReactMarkdown>
            </div>

            {headings.length >= 3 && (
              <aside className="hidden lg:block">
                <div className="sticky top-28">
                  <TableOfContents headings={headings} />
                </div>
              </aside>
            )}
          </div>
        </div>

        {/* ── Related posts ───────────────────────────────────────────────── */}
        {related.length > 0 && (
          <section className="mx-auto mt-20 max-w-5xl px-6">
            <div className="mb-6 flex items-center gap-4">
              <h2 className="font-mono text-[11px] font-semibold uppercase tracking-widest text-text-tertiary">Keep reading</h2>
              <div className="h-px flex-1 bg-border-subtle" />
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              {related.map(r => (
                <Link key={r.id} href={`/blog/${r.slug}`} className="group block">
                  <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-elevated/60 transition-all duration-300 hover:-translate-y-1 hover:border-brand-violet/40">
                    {r.cover_image_url ? (
                      <div className="aspect-[16/9] overflow-hidden bg-surface-secondary">
                        <img src={r.cover_image_url} alt={r.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                      </div>
                    ) : (
                      <div className="aspect-[16/9] bg-gradient-to-br from-brand-violet/15 to-brand-aqua/10" />
                    )}
                    <div className="flex flex-1 flex-col p-5">
                      <h3 className="text-[15px] font-semibold leading-snug text-text-primary transition-colors group-hover:text-brand-violet line-clamp-2">{r.title}</h3>
                      {r.word_count ? <p className="mt-auto pt-3 text-[11px] text-text-tertiary">{readingTime(r.word_count)}</p> : null}
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── CTA ─────────────────────────────────────────────────────────── */}
        <section className="mx-auto mt-20 max-w-5xl px-6">
          <div className="relative overflow-hidden rounded-3xl border border-brand-violet/20 bg-gradient-to-br from-brand-violet/10 via-surface-elevated to-brand-aqua/10 p-10 text-center">
            <h2 className="text-[24px] font-bold tracking-tight text-text-primary">Start ranking with AI-generated content</h2>
            <p className="mx-auto mt-3 max-w-md text-[14.5px] leading-relaxed text-text-secondary">
              Rankshoot generates SEO-optimised articles like this one — keyword-researched, competitor-aware, and ready to publish.
            </p>
            <Link
              href="/sign-up"
              className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand-violet px-6 py-3 text-[13.5px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-action-hover"
            >
              Get started free
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </Link>
          </div>
        </section>
      </article>
    </>
  );
}
