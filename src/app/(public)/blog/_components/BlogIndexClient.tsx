"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { NormalisedArticle } from "@/services/strapi/types";
import { formatBlogDate, readingTime } from "@/components/blog/blog-format";

function Meta({ article, light }: { article: NormalisedArticle; light?: boolean }) {
  const cls = light ? "text-white/80" : "text-text-tertiary";
  return (
    <div className={`flex flex-wrap items-center gap-2.5 text-[11px] ${cls}`}>
      {article.publishedAt && <time dateTime={article.publishedAt}>{formatBlogDate(article.publishedAt)}</time>}
      {article.word_count ? (
        <>
          <span className={`h-1 w-1 rounded-full ${light ? "bg-white/40" : "bg-border-strong"}`} />
          <span>{readingTime(article.word_count)}</span>
        </>
      ) : null}
    </div>
  );
}

function FeaturedCard({ article }: { article: NormalisedArticle }) {
  return (
    <Link href={`/blog/${article.slug}`} className="group relative block overflow-hidden rounded-3xl border border-border-subtle">
      <div className="relative aspect-[16/10] w-full sm:aspect-[2/1]">
        {article.cover_image_url ? (
          <img
            src={article.cover_image_url}
            alt={article.title}
            className="h-full w-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-brand-violet/35 via-surface-secondary to-brand-aqua/25" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-9">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full bg-brand-violet px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-white">Featured</span>
            {article.target_keyword && (
              <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-white backdrop-blur-sm">
                {article.target_keyword}
              </span>
            )}
          </div>
          <h2 className="text-balance text-[24px] font-bold leading-tight tracking-tight text-white drop-shadow-sm sm:text-[34px]">
            {article.title}
          </h2>
          {article.excerpt && (
            <p className="mt-3 hidden max-w-xl text-[14.5px] leading-relaxed text-white/85 sm:line-clamp-2 sm:block">{article.excerpt}</p>
          )}
          <div className="mt-4"><Meta article={article} light /></div>
        </div>
      </div>
    </Link>
  );
}

function Card({ article, index }: { article: NormalisedArticle; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.5, delay: (index % 3) * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link href={`/blog/${article.slug}`} className="group block h-full">
        <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-elevated/60 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-violet/40 hover:shadow-[0_22px_60px_-26px_rgba(99,102,241,0.55)]">
          <div className="relative aspect-[16/9] overflow-hidden bg-surface-secondary">
            {article.cover_image_url ? (
              <img
                src={article.cover_image_url}
                alt={article.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-brand-violet/15 via-surface-secondary to-brand-aqua/10" />
            )}
            {article.target_keyword && (
              <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-widest text-white backdrop-blur-sm">
                {article.target_keyword}
              </span>
            )}
          </div>
          <div className="flex flex-1 flex-col p-5">
            <h3 className="mb-2 line-clamp-2 text-[16.5px] font-semibold leading-snug tracking-tight text-text-primary transition-colors group-hover:text-brand-violet">
              {article.title}
            </h3>
            {article.excerpt && (
              <p className="mb-4 line-clamp-2 flex-1 text-[13px] leading-relaxed text-text-secondary">{article.excerpt}</p>
            )}
            <div className="mt-auto flex items-center justify-between gap-2">
              <Meta article={article} />
              <span className="flex items-center gap-1 text-[11px] font-medium text-brand-violet opacity-0 transition-opacity group-hover:opacity-100">
                Read
                <svg className="h-3 w-3 transition-transform group-hover:translate-x-0.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h10M9 4l4 4-4 4" />
                </svg>
              </span>
            </div>
          </div>
        </article>
      </Link>
    </motion.div>
  );
}

export function BlogIndexClient({ articles, total }: { articles: NormalisedArticle[]; total: number }) {
  const [featured, ...rest] = articles;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24">
      {/* Masthead */}
      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="mx-auto max-w-3xl py-16 text-center sm:py-20"
      >
        <p className="mb-5 font-mono text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-violet">Rankshoot · Blog</p>
        <h1 className="text-balance text-[40px] font-bold leading-[1.05] tracking-tight text-text-primary sm:text-[58px]">
          The content &amp; SEO playbook
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-text-secondary sm:text-[18px]">
          Tactics, teardowns, and growth playbooks for ranking in the AI era — written for teams that ship.
        </p>
      </motion.header>

      {featured && (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        >
          <FeaturedCard article={featured} />
        </motion.div>
      )}

      {rest.length > 0 && (
        <section className="mt-12">
          <div className="mb-6 flex items-center gap-4">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-text-tertiary">Latest articles</p>
            <span className="text-[11px] text-text-tertiary">{total}</span>
            <div className="h-px flex-1 bg-border-subtle" />
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((article, i) => (
              <Card key={article.id} article={article} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
