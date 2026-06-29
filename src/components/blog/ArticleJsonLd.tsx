import type { NormalisedArticle } from "@/services/strapi/types";
import { extractFaqs } from "./blog-format";

/**
 * Structured data for a blog post. Emits Article (BlogPosting) JSON-LD and, when
 * the body contains a recognisable FAQ section, a FAQPage block — both improve
 * eligibility for rich results / AI Overviews. Server component: renders inert
 * <script type="application/ld+json"> tags.
 */
export function ArticleJsonLd({
  article,
  url,
  siteName = "Rankshoot",
}: {
  article: NormalisedArticle;
  url: string;
  siteName?: string;
}) {
  const article_ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.title,
    description: article.meta_description || article.excerpt || undefined,
    image: article.cover_image_url ? [article.cover_image_url] : undefined,
    datePublished: article.publishedAt || article.createdAt || undefined,
    dateModified: article.updatedAt || article.publishedAt || undefined,
    author: { "@type": "Organization", name: siteName },
    publisher: { "@type": "Organization", name: siteName },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    keywords: article.target_keyword || undefined,
    wordCount: article.word_count || undefined,
  };

  const faqs = extractFaqs(article.content);
  const faq_ld =
    faqs.length >= 2
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map(f => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }
      : null;

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(article_ld) }}
      />
      {faq_ld && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faq_ld) }}
        />
      )}
    </>
  );
}
