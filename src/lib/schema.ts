import type { Blog } from "./types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FaqPair {
  question: string;
  answer: string;
}

export interface ProjectMeta {
  domain?: string;
  company?: string;
}

// ─── FAQ parser ─────────────────────────────────────────────────────────────

/**
 * Extract Q&A pairs from the `## Frequently Asked Questions` section of the
 * markdown blog content.
 *
 * The LLM always writes the section as:
 *   ## Frequently Asked Questions
 *   ### Question text
 *   Answer paragraph(s)
 *   ### Next question
 *   …
 *
 * We parse every ### inside the FAQ section until the next ## (or end of file).
 */
export function parseFaqPairs(content: string): FaqPair[] {
  // Find the FAQ section heading (case-insensitive, allow # prefix variations)
  const faqHeadingRe = /^##\s+(?:frequently asked questions|faq|faqs)\s*$/im;
  const match = faqHeadingRe.exec(content);
  if (!match) return [];

  // Slice from the FAQ heading to the next ## heading (or end of string)
  const afterFaq = content.slice(match.index + match[0].length);
  const nextH2 = afterFaq.search(/^##\s+(?!#)/m);
  const faqSection = nextH2 === -1 ? afterFaq : afterFaq.slice(0, nextH2);

  // Each Q&A starts with ### and runs until the next ### (or end of section)
  const qaParts = faqSection.split(/^###\s+/m).filter(Boolean);

  const pairs: FaqPair[] = [];
  for (const part of qaParts) {
    const lines = part.trim().split(/\n/);
    if (!lines.length) continue;
    const question = lines[0].trim().replace(/\?$/, "").trim() + "?";
    const answer = lines
      .slice(1)
      .join(" ")
      .replace(/\s+/g, " ")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // strip markdown links
      .replace(/\*\*([^*]+)\*\*/g, "$1")        // strip bold
      .replace(/\*([^*]+)\*/g, "$1")            // strip italic
      .trim();
    if (question && answer) pairs.push({ question, answer });
  }

  return pairs;
}

// ─── Article JSON-LD ────────────────────────────────────────────────────────

export function buildArticleSchema(
  blog: Blog,
  projectMeta?: ProjectMeta
): Record<string, unknown> {
  const domainRaw = projectMeta?.domain ?? "";
  const domain =
    domainRaw.startsWith("http") ? domainRaw.replace(/\/$/, "") : domainRaw ? `https://${domainRaw}` : "";
  const company = projectMeta?.company ?? "";
  const datePublished = (blog.created_at ?? new Date().toISOString()).split("T")[0];
  const dateModified = (blog.updated_at ?? blog.created_at ?? new Date().toISOString()).split("T")[0];
  const url = domain ? `${domain}/${blog.slug}` : `/${blog.slug}`;

  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: blog.title,
    description: blog.meta_description,
    keywords: blog.target_keyword,
    articleSection: blog.article_type,
    wordCount: blog.word_count,
    datePublished,
    dateModified,
    url,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    ...(company
      ? {
          author: {
            "@type": "Organization",
            name: company,
            ...(domain ? { url: domain } : {}),
          },
          publisher: {
            "@type": "Organization",
            name: company,
            ...(domain ? { url: domain } : {}),
          },
        }
      : {}),
  };
}

// ─── FAQPage JSON-LD ────────────────────────────────────────────────────────

export function buildFaqSchema(pairs: FaqPair[]): Record<string, unknown> | null {
  if (!pairs.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pairs.map((p) => ({
      "@type": "Question",
      name: p.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: p.answer,
      },
    })),
  };
}

// ─── Combined helper ─────────────────────────────────────────────────────────

export interface BlogSchemas {
  article: Record<string, unknown>;
  faq: Record<string, unknown> | null;
  faqPairs: FaqPair[];
}

export function buildBlogSchemas(blog: Blog, projectMeta?: ProjectMeta): BlogSchemas {
  const faqPairs = parseFaqPairs(blog.content);
  const article = buildArticleSchema(blog, projectMeta);
  const faq = buildFaqSchema(faqPairs);
  return { article, faq, faqPairs };
}
