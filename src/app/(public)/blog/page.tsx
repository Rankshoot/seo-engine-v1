import type { Metadata } from "next";
import Link from "next/link";
import { strapiClient } from "@/services/strapi/client";
import type { NormalisedArticle } from "@/services/strapi/types";

export const metadata: Metadata = {
  title: "Blog | Rankshoot",
  description: "SEO insights, AI content strategies, and growth playbooks from the Rankshoot team.",
};

export const revalidate = 300;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function readTime(wordCount: number | null): string {
  if (!wordCount) return "";
  return `${Math.ceil(wordCount / 200)} min read`;
}

function ArticleCard({ article, featured }: { article: NormalisedArticle; featured?: boolean }) {
  return (
    <Link href={`/blog/${article.slug}`} className="group block h-full">
      <article
        className={`h-full flex flex-col rounded-2xl border border-border-subtle overflow-hidden bg-surface-primary transition-all duration-200 hover:border-border-strong hover:shadow-lg hover:shadow-black/5 hover:-translate-y-0.5 ${
          featured ? "lg:flex-row" : ""
        }`}
      >
        {article.cover_image_url && (
          <div className={`overflow-hidden bg-surface-secondary shrink-0 ${
            featured ? "lg:w-[48%] aspect-[16/9] lg:aspect-auto" : "aspect-[16/9]"
          }`}>
            <img
              src={article.cover_image_url}
              alt={article.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              loading="lazy"
            />
          </div>
        )}
        <div className={`flex flex-col flex-1 p-6 ${featured ? "lg:p-8 lg:justify-center" : ""}`}>
          {article.target_keyword && (
            <span className="inline-flex items-center mb-3 text-[10px] font-semibold uppercase tracking-widest px-2.5 py-1 rounded-full border border-border-subtle text-text-tertiary w-fit">
              {article.target_keyword}
            </span>
          )}
          <h2 className={`font-bold leading-snug text-text-primary mb-3 group-hover:text-brand-action transition-colors ${
            featured ? "text-[24px] lg:text-[28px]" : "text-[17px]"
          }`}>
            {article.title}
          </h2>
          {article.excerpt && (
            <p className={`text-text-secondary leading-relaxed mb-4 flex-1 ${
              featured ? "text-[15px] line-clamp-4" : "text-[13px] line-clamp-3"
            }`}>
              {article.excerpt}
            </p>
          )}
          <div className="flex items-center gap-3 mt-auto pt-2">
            {article.publishedAt && (
              <time className="text-[11px] text-text-tertiary" dateTime={article.publishedAt}>
                {formatDate(article.publishedAt)}
              </time>
            )}
            {article.word_count && (
              <>
                <span className="w-1 h-1 rounded-full bg-border-strong" />
                <span className="text-[11px] text-text-tertiary">{readTime(article.word_count)}</span>
              </>
            )}
            <span className="ml-auto text-[11px] font-medium text-brand-action opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              Read more
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

export default async function BlogListPage() {
  if (!strapiClient.isConfigured()) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-32 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-surface-secondary border border-border-subtle mb-6">
          <svg className="w-6 h-6 text-text-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z" />
          </svg>
        </div>
        <h1 className="text-[28px] font-bold text-text-primary mb-2">Blog coming soon</h1>
        <p className="text-[14px] text-text-tertiary">We&apos;re working on something great. Check back soon.</p>
      </div>
    );
  }

  let articles: NormalisedArticle[] = [];
  let total = 0;

  try {
    const res = await strapiClient.listArticles({ pageSize: 24 });
    articles = res.data;
    total    = res.total;
  } catch (err) {
    console.error("[blog] failed to fetch from Strapi", err);
  }

  const [featured, ...rest] = articles;

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      {/* Hero */}
      <div className="mb-14 max-w-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-action/10 border border-brand-action/20 text-brand-action text-[11px] font-semibold uppercase tracking-widest mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-action animate-pulse" />
          From the team
        </div>
        <h1 className="text-[42px] font-bold tracking-tight text-text-primary leading-[1.15] mb-4">
          Rankshoot Blog
        </h1>
        <p className="text-[17px] text-text-secondary leading-relaxed">
          SEO insights, AI content strategies, and growth playbooks to help you rank higher and ship faster.
        </p>
      </div>

      {articles.length === 0 ? (
        <div className="py-24 text-center border border-border-subtle rounded-2xl bg-surface-secondary/40">
          <p className="text-[15px] font-medium text-text-primary mb-1">No posts yet</p>
          <p className="text-[13px] text-text-tertiary">Check back soon — we&apos;re writing.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Featured post */}
          {featured && (
            <div className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary mb-4" style={{ fontFamily: "CohereMono, monospace" }}>
                Latest post
              </p>
              <ArticleCard article={featured} featured />
            </div>
          )}

          {/* Grid */}
          {rest.length > 0 && (
            <>
              <div className="h-px bg-border-subtle" />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-text-tertiary" style={{ fontFamily: "CohereMono, monospace" }}>
                All posts · {total}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {rest.map(article => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
