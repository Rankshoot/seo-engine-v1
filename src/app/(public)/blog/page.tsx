import type { Metadata } from "next";
import Link from "next/link";
import { strapiClient } from "@/services/strapi/client";
import type { NormalisedArticle } from "@/services/strapi/types";
import { formatBlogDate, readingTime } from "@/components/blog/blog-format";

export const metadata: Metadata = {
  title: "Blog | Rankshoot",
  description: "SEO insights, AI content strategies, and growth playbooks to help you rank higher and ship faster.",
};

export const revalidate = 300;

function ArticleCard({ article, featured }: { article: NormalisedArticle; featured?: boolean }) {
  return (
    <Link href={`/blog/${article.slug}`} className="group block h-full">
      <article
        className={`flex h-full flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-elevated/60 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand-violet/40 hover:shadow-[0_18px_50px_-20px_rgba(99,102,241,0.45)] ${
          featured ? "lg:flex-row" : ""
        }`}
      >
        {article.cover_image_url ? (
          <div className={`relative overflow-hidden bg-surface-secondary shrink-0 ${featured ? "lg:w-[52%] aspect-[16/10] lg:aspect-auto" : "aspect-[16/9]"}`}>
            <img
              src={article.cover_image_url}
              alt={article.title}
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </div>
        ) : (
          <div className={`relative shrink-0 overflow-hidden bg-gradient-to-br from-brand-violet/15 via-surface-secondary to-brand-aqua/10 ${featured ? "lg:w-[52%] aspect-[16/10] lg:aspect-auto" : "aspect-[16/9]"}`} />
        )}

        <div className={`flex flex-1 flex-col p-6 ${featured ? "lg:justify-center lg:p-10" : ""}`}>
          {article.target_keyword && (
            <span className="mb-3 inline-flex w-fit items-center rounded-full border border-brand-violet/20 bg-brand-violet/5 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-brand-violet">
              {article.target_keyword}
            </span>
          )}
          <h2 className={`mb-3 font-bold leading-snug tracking-tight text-text-primary transition-colors group-hover:text-brand-violet ${featured ? "text-[26px] lg:text-[34px]" : "text-[18px]"}`}>
            {article.title}
          </h2>
          {article.excerpt && (
            <p className={`mb-5 flex-1 leading-relaxed text-text-secondary ${featured ? "text-[15px] line-clamp-4" : "text-[13.5px] line-clamp-3"}`}>
              {article.excerpt}
            </p>
          )}
          <div className="mt-auto flex items-center gap-3 pt-2 text-[11px] text-text-tertiary">
            {article.publishedAt && <time dateTime={article.publishedAt}>{formatBlogDate(article.publishedAt)}</time>}
            {article.word_count ? (
              <>
                <span className="h-1 w-1 rounded-full bg-border-strong" />
                <span>{readingTime(article.word_count)}</span>
              </>
            ) : null}
            <span className="ml-auto flex items-center gap-1 font-medium text-brand-violet opacity-0 transition-opacity group-hover:opacity-100">
              Read
              <svg className="h-3 w-3 transition-transform group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
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
      <div className="mx-auto max-w-3xl px-6 py-32 text-center">
        <h1 className="mb-2 text-[28px] font-bold tracking-tight text-text-primary">Blog coming soon</h1>
        <p className="text-[14px] text-text-tertiary">We&apos;re working on something great. Check back soon.</p>
      </div>
    );
  }

  let articles: NormalisedArticle[] = [];
  let total = 0;
  try {
    const res = await strapiClient.listArticles({ pageSize: 24 });
    articles = res.data;
    total = res.total;
  } catch (err) {
    console.error("[blog] failed to fetch from Strapi", err);
  }

  const [featured, ...rest] = articles;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24">
      {/* Masthead */}
      <header className="mx-auto max-w-3xl py-16 text-center sm:py-20">
        <p className="mb-5 font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-violet">
          Rankshoot · Blog
        </p>
        <h1 className="text-balance text-[40px] font-bold leading-[1.08] tracking-tight text-text-primary sm:text-[56px]">
          The content &amp; SEO playbook
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-text-secondary sm:text-[18px]">
          Tactics, teardowns, and growth playbooks for ranking in the AI era — written for teams that ship.
        </p>
      </header>

      {articles.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface-secondary/40 py-24 text-center">
          <p className="mb-1 text-[15px] font-medium text-text-primary">No posts yet</p>
          <p className="text-[13px] text-text-tertiary">Check back soon — we&apos;re writing.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {featured && (
            <section>
              <p className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Latest</p>
              <ArticleCard article={featured} featured />
            </section>
          )}

          {rest.length > 0 && (
            <section className="space-y-5">
              <div className="flex items-center gap-4">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">All posts</p>
                <span className="text-[11px] text-text-tertiary">{total}</span>
                <div className="h-px flex-1 bg-border-subtle" />
              </div>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map(article => (
                  <ArticleCard key={article.id} article={article} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
