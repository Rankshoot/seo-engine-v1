/** Path segments under `/projects/:id` that are not UUIDs — use dedicated routes instead. */
export const RESERVED_PROJECT_SLUGS = new Set(["admin", "new"]);

export function isReservedProjectSlug(id: string): boolean {
  return RESERVED_PROJECT_SLUGS.has(id.toLowerCase());
}

/** Map a mistaken `/projects/admin/...` path to the platform admin panel. */
export function adminPanelPathFromProjectsAdmin(pathname: string): string | null {
  const lower = pathname.toLowerCase();
  if (lower === "/projects/admin") return "/admin";
  if (lower.startsWith("/projects/admin/")) {
    return `/admin${pathname.slice("/projects/admin".length)}`;
  }
  return null;
}
