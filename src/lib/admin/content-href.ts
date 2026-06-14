import type { AdminContentRow } from "@/types/admin-content";

export function adminContentEditorHref(row: AdminContentRow): string {
  const base = `/projects/${row.projectId}`;
  switch (row.contentType) {
    case "ebook":
      return `${base}/content-generator/ebooks/${row.id}`;
    case "whitepaper":
      return `${base}/content-generator/whitepapers/${row.id}`;
    case "linkedin":
      return `${base}/content-generator/linkedin/${row.id}`;
    case "blog":
    default:
      return `${base}/content-generator/blogs/${row.id}`;
  }
}
