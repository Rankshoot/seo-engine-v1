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
 * Extract Q&A pairs from the FAQ section of the markdown blog content.
 *
 * The LLM usually writes the section as:
 *   ## Frequently Asked Questions
 *   ### Question text
 *   Answer paragraph(s)
 *   ### Next question
 *   …
 * but real drafts drift: "## FAQs", "## FAQ", trailing colons, bold wrappers,
 * or "## Frequently Asked Questions (FAQs)". We accept all of those, parse
 * every ### until the next ## (or end of file), and normalize the answers to
 * plain text — Google rejects FAQPage rich results whose answer text contains
 * markup artifacts.
 */
export function parseFaqPairs(content: string): FaqPair[] {
  // FAQ heading variants: optional bold markers, optional "(FAQs)" suffix,
  // optional trailing colon.
  const faqHeadingRe =
    /^##\s+\**\s*(?:frequently asked questions|faqs?)\s*(?:\(faqs?\))?\s*:?\s*\**\s*$/im;
  const match = faqHeadingRe.exec(content);
  if (!match) return [];

  // Slice from the FAQ heading to the next ## heading (or end of string)
  const afterFaq = content.slice(match.index + match[0].length);
  const nextH2 = afterFaq.search(/^##\s+(?!#)/m);
  const faqSection = nextH2 === -1 ? afterFaq : afterFaq.slice(0, nextH2);

  // Each Q&A starts with ### and runs until the next ### (or end of section)
  const qaParts = faqSection.split(/^###\s+/m).filter(Boolean);

  const pairs: FaqPair[] = [];
  const seenQuestions = new Set<string>();
  for (const part of qaParts) {
    const lines = part.trim().split(/\n/);
    if (!lines.length) continue;
    const question =
      lines[0]
        .trim()
        .replace(/\*\*/g, "")
        .replace(/\?$/, "")
        .trim() + "?";
    const answer = lines
      .slice(1)
      .join(" ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")     // strip images entirely
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // strip markdown links
      .replace(/`([^`]*)`/g, "$1")              // strip inline code
      .replace(/\*\*([^*]+)\*\*/g, "$1")        // strip bold
      .replace(/\*([^*]+)\*/g, "$1")            // strip italic
      .replace(/^\s*[>#-]+\s*/gm, "")           // strip stray block markers
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1200);                          // FAQPage answers should stay concise
    const qKey = question.toLowerCase();
    // Skip empty/near-empty answers and duplicate questions — both invalidate
    // the FAQPage rich result.
    if (question.length > 4 && answer.length >= 20 && !seenQuestions.has(qKey)) {
      seenQuestions.add(qKey);
      pairs.push({ question, answer });
    }
  }

  return pairs;
}

// ─── Article JSON-LD ────────────────────────────────────────────────────────

/**
 * First real (http/https) content image, for the schema `image` property —
 * Google requires an image for Article rich-result eligibility. `data:` URIs
 * and placeholder markers are useless in structured data and are skipped.
 */
function firstContentImage(markdown: string): string | null {
  const re = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const url = m[1];
    if (!/placehold|placeholder|dummyimage|loremflickr/i.test(url)) return url;
  }
  return null;
}

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
  const image = firstContentImage(blog.content ?? "");

  return {
    "@context": "https://schema.org",
    // BlogPosting is the Article subtype Google documents for blog content;
    // it inherits Article eligibility while being more precise.
    "@type": "BlogPosting",
    // Google truncates/ignores headlines beyond ~110 chars.
    headline: (blog.title ?? "").slice(0, 110),
    description: blog.meta_description,
    keywords: blog.target_keyword,
    articleSection: blog.article_type,
    wordCount: blog.word_count,
    inLanguage: "en",
    datePublished,
    dateModified,
    url,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": url,
    },
    ...(image ? { image: [image] } : {}),
    // Voice assistants read these parts aloud (AEO); headline + description
    // are the safest universally-present speakable fields.
    speakable: {
      "@type": "SpeakableSpecification",
      xpath: ["/html/head/title", "/html/head/meta[@name='description']/@content"],
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

/**
 * Ready-to-paste `<script type="application/ld+json">` block(s) for a CMS
 * `<head>`. Used by the viewer's "Copy structured data" action and anywhere
 * else the user needs the schema outside our own HTML export.
 */
export function buildSchemaScriptTags(blog: Blog, projectMeta?: ProjectMeta): string {
  const { article, faq } = buildBlogSchemas(blog, projectMeta);
  const blocks = [article, ...(faq ? [faq] : [])].map(
    (s) => `<script type="application/ld+json">\n${JSON.stringify(s, null, 2)}\n</script>`
  );
  return blocks.join("\n");
}
