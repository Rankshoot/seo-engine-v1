import type { Metadata } from "next";
import Link from "next/link";
import { strapiClient } from "@/services/strapi/client";
import type { NormalisedArticle } from "@/services/strapi/types";

export const metadata: Metadata = {
  title: "Blog",
  description: "SEO insights, AI content strategies, and growth playbooks from the Rankshoot team.",
};

// ISR: revalidate every 5 minutes so new Strapi articles appear quickly
export const revalidate = 300;

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function ArticleCard({ article }: { article: NormalisedArticle }) {
  return (
    <article className="group border border-border-subtle rounded-2xl overflow-hidden hover:border-border-strong transition-colors bg-surface-primary hover:bg-surface-secondary">
      {article.cover_image_url && (
        <div className="aspect-[16/9] overflow-hidden bg-surface-secondary">
          <img
            src={article.cover_image_url}
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-6">
        {article.target_keyword && (
          <span className="inline-block mb-3 text-[10px] font-semibold uppercase tracking-widest text-text-tertiary border border-border-subtle rounded-full px-2.5 py-0.5">
            {article.target_keyword}
          </span>
        )}
        <h2 className="text-[18px] font-bold leading-snug text-text-primary mb-2 group-hover:text-brand-action transition-colors line-clamp-2">
          <Link href={`/blog/${article.slug}`}>{article.title}</Link>
        </h2>
        {article.excerpt && (
          <p className="text-[13px] text-text-secondary leading-relaxed line-clamp-3 mb-4">
            {article.excerpt}
          </p>
        )}
        <div className="flex items-center justify-between">
          <time className="text-[11px] text-text-tertiary" dateTime={article.publishedAt ?? ""}>
            {formatDate(article.publishedAt)}
          </time>
          {article.word_count && (
            <span className="text-[11px] text-text-tertiary">
              {Math.ceil(article.word_count / 200)} min read
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

export default async function BlogListPage() {
  if (!strapiClient.isConfigured()) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-24 text-center">
        <p className="text-[14px] text-text-tertiary">Blog coming soon.</p>
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
    console.error("[blog] failed to fetch articles from Strapi", err);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="mb-12">
        <h1 className="text-[40px] font-bold tracking-tight text-text-primary mb-3">
          Rankshoot Blog
        </h1>
        <p className="text-[16px] text-text-secondary max-w-xl leading-relaxed">
          SEO insights, AI content strategies, and growth playbooks — straight from the team
          building the future of search.
        </p>
      </div>

      {articles.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-[14px] text-text-tertiary">No posts yet. Check back soon.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {articles.map(article => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
          <p className="mt-8 text-center text-[12px] text-text-tertiary">
            {total} {total === 1 ? "article" : "articles"} published
          </p>
        </>
      )}
    </div>
  );
}
