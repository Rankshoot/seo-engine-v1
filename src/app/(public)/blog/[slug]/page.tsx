import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { strapiClient } from "@/services/strapi/client";

export const revalidate = 300;

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  if (!strapiClient.isConfigured()) return {};
  const { slug } = await params;
  try {
    const article = await strapiClient.getArticleBySlug(slug);
    if (!article) return { title: "Not Found" };
    return {
      title: `${article.title} | Rankshoot Blog`,
      description: article.meta_description || article.excerpt,
      openGraph: {
        title: article.title,
        description: article.meta_description || article.excerpt,
        type: "article",
        publishedTime: article.publishedAt ?? undefined,
        images: article.cover_image_url
          ? [{ url: article.cover_image_url, width: 1200, height: 630, alt: article.title }]
          : [],
      },
      twitter: {
        card: "summary_large_image",
        title: article.title,
        description: article.meta_description || article.excerpt,
        images: article.cover_image_url ? [article.cover_image_url] : [],
      },
    };
  } catch {
    return {};
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

export default async function BlogPostPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!strapiClient.isConfigured()) notFound();

  const { slug } = await params;
  const article = await strapiClient.getArticleBySlug(slug).catch(() => null);
  if (!article) notFound();

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="max-w-3xl mx-auto">
        {/* Back */}
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-[12px] text-text-tertiary hover:text-text-secondary transition-colors mb-10 group"
        >
          <svg className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 8H3M7 4l-4 4 4 4" />
          </svg>
          Back to Blog
        </Link>

        {/* Tag */}
        {article.target_keyword && (
          <span className="inline-flex items-center mb-5 text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full border border-border-subtle text-text-tertiary">
            {article.target_keyword}
          </span>
        )}

        {/* Title */}
        <h1 className="text-[36px] sm:text-[42px] font-bold leading-[1.15] tracking-tight text-text-primary mb-5">
          {article.title}
        </h1>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-4 mb-10 pb-8 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-action to-brand-coral flex items-center justify-center text-white text-[11px] font-bold">
              R
            </div>
            <span className="text-[13px] font-medium text-text-primary">Rankshoot Team</span>
          </div>
          {article.publishedAt && (
            <>
              <span className="w-1 h-1 rounded-full bg-border-strong" />
              <time className="text-[12px] text-text-tertiary" dateTime={article.publishedAt}>
                {formatDate(article.publishedAt)}
              </time>
            </>
          )}
          {article.word_count && (
            <>
              <span className="w-1 h-1 rounded-full bg-border-strong" />
              <span className="text-[12px] text-text-tertiary">
                {Math.ceil(article.word_count / 200)} min read
              </span>
            </>
          )}
          {article.seo_score && (
            <span className="ml-auto flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border"
              style={{
                borderColor: article.seo_score >= 80 ? "#16a34a30" : "#d9770630",
                color: article.seo_score >= 80 ? "#16a34a" : "#d97706",
                background: article.seo_score >= 80 ? "#16a34a08" : "#d9770608",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: article.seo_score >= 80 ? "#16a34a" : "#d97706" }} />
              SEO {article.seo_score}
            </span>
          )}
        </div>

        {/* Cover image */}
        {article.cover_image_url && (
          <div className="mb-12 rounded-2xl overflow-hidden aspect-[16/9] bg-surface-secondary border border-border-subtle">
            <img
              src={article.cover_image_url}
              alt={article.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div className="prose prose-neutral max-w-none dark:prose-invert
          prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-text-primary
          prose-h1:text-[32px] prose-h2:text-[24px] prose-h2:mt-10 prose-h2:mb-4
          prose-h3:text-[18px] prose-h3:mt-8 prose-h3:mb-3
          prose-p:text-text-secondary prose-p:leading-[1.85] prose-p:text-[16px]
          prose-a:text-brand-action prose-a:font-medium prose-a:no-underline hover:prose-a:underline
          prose-strong:text-text-primary prose-strong:font-semibold
          prose-code:text-[13px] prose-code:bg-surface-secondary prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-[4px] prose-code:border prose-code:border-border-subtle prose-code:text-text-primary prose-code:before:content-none prose-code:after:content-none
          prose-pre:bg-surface-secondary prose-pre:border prose-pre:border-border-subtle prose-pre:rounded-xl prose-pre:text-[13px]
          prose-blockquote:border-l-brand-action prose-blockquote:text-text-secondary prose-blockquote:not-italic
          prose-ul:text-text-secondary prose-ol:text-text-secondary
          prose-li:text-[15px] prose-li:leading-relaxed
          prose-img:rounded-xl prose-img:border prose-img:border-border-subtle prose-img:shadow-sm
          prose-hr:border-border-subtle prose-hr:my-10
        ">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {article.content}
          </ReactMarkdown>
        </div>

        {/* Footer CTA */}
        <div className="mt-16 pt-10 border-t border-border-subtle">
          <div className="rounded-2xl border border-border-subtle bg-surface-secondary p-8 text-center">
            <h3 className="text-[20px] font-bold text-text-primary mb-2">
              Start ranking with AI-generated content
            </h3>
            <p className="text-[14px] text-text-secondary mb-6 max-w-md mx-auto leading-relaxed">
              Rankshoot generates SEO-optimised blogs like this one — keyword-researched, competitor-aware, and ready to publish.
            </p>
            <a
              href="/sign-up"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-[13px] font-semibold bg-text-primary text-surface-primary hover:opacity-90 transition-opacity"
            >
              Get started free
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </a>
          </div>

          <div className="mt-8">
            <Link
              href="/blog"
              className="inline-flex items-center gap-1.5 text-[12px] text-text-tertiary hover:text-text-secondary transition-colors group"
            >
              <svg className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 8H3M7 4l-4 4 4 4" />
              </svg>
              Back to all posts
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
