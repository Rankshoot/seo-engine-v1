/**
 * Centralized utility for resolving preview URLs for generated content.
 */
export function getContentPreviewUrl(
  projectId: string,
  contentId: string,
  contentType: string
): string {
  const normalizedType = (contentType || "").trim().toLowerCase();

  switch (normalizedType) {
    case "blog":
    case "blog article":
    case "blog_article":
    case "blog post":
    case "blog_post":
      return `/projects/${projectId}/blogs/${contentId}`;

    case "ebook":
    case "e-book":
    case "e book":
      return `/projects/${projectId}/content-generator/ebooks/${contentId}`;

    case "whitepaper":
    case "white paper":
      return `/projects/${projectId}/content-generator/whitepapers/${contentId}`;

    case "linkedin":
    case "linkedin post":
    case "linkedin_post":
      return `/projects/${projectId}/content-generator/linkedin/${contentId}`;

    default:
      // Fallback path
      return `/projects/${projectId}/blogs/${contentId}`;
  }
}
