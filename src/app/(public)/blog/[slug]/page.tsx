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
      title:       article.title,
      description: article.meta_description || article.excerpt,
      openGraph: {
        title:       article.title,
        description: article.meta_description || article.excerpt,
        type:        "article",
        publishedTime: article.publishedAt ?? undefined,
        images: article.cover_image_url
          ? [{ url: article.cover_image_url, width: 1200, height: 630, alt: article.title }]
          : [],
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
    <div className="max-w-3xl mx-auto px-6 py-16">
      <div className="mb-4">
        <Link
          href="/blog"
          className="text-[12px] text-text-tertiary hover:text-text-secondary transition-colors"
        >
          ← All posts
        </Link>
      </div>

      {article.target_keyword && (
        <span className="inline-block mb-4 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary border border-border-subtle rounded-full px-2.5 py-0.5">
          {article.target_keyword}
        </span>
      )}

      <h1 className="text-[36px] font-bold leading-tight text-text-primary mb-4">
        {article.title}
      </h1>

      <div className="flex items-center gap-4 mb-8 text-[12px] text-text-tertiary">
        {article.publishedAt && (
          <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
        )}
        {article.word_count && (
          <span>{Math.ceil(article.word_count / 200)} min read</span>
        )}
        {article.seo_score && (
          <span className="flex items-center gap-1">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: article.seo_score >= 80 ? "#16a34a" : article.seo_score >= 60 ? "#d97706" : "#dc2626" }}
            />
            SEO {article.seo_score}
          </span>
        )}
      </div>

      {article.cover_image_url && (
        <div className="mb-10 rounded-2xl overflow-hidden aspect-[16/9] bg-surface-secondary">
          <img
            src={article.cover_image_url}
            alt={article.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="prose prose-neutral max-w-none dark:prose-invert prose-headings:font-bold prose-headings:tracking-tight prose-a:text-brand-action prose-a:no-underline hover:prose-a:underline prose-code:text-[13px] prose-pre:bg-surface-secondary prose-pre:border prose-pre:border-border-subtle prose-img:rounded-xl prose-img:border prose-img:border-border-subtle">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {article.content}
        </ReactMarkdown>
      </div>

      <div className="mt-16 pt-8 border-t border-border-subtle">
        <Link
          href="/blog"
          className="text-[13px] font-medium text-text-secondary hover:text-text-primary transition-colors"
        >
          ← Back to Blog
        </Link>
      </div>
    </div>
  );
}
