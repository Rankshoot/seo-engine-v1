import type { Metadata } from "next";
import { strapiClient } from "@/services/strapi/client";
import type { NormalisedArticle } from "@/services/strapi/types";
import { BlogIndexClient } from "./_components/BlogIndexClient";

export const metadata: Metadata = {
  title: "Blog | Rankshoot",
  description: "SEO insights, AI content strategies, and growth playbooks to help you rank higher and ship faster.",
};

export const revalidate = 300;

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

  if (articles.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-32 text-center">
        <p className="mb-1 text-[15px] font-medium text-text-primary">No posts yet</p>
        <p className="text-[13px] text-text-tertiary">Check back soon — we&apos;re writing.</p>
      </div>
    );
  }

  return <BlogIndexClient articles={articles} total={total} />;
}
