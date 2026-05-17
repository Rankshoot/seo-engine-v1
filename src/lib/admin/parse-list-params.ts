export interface AdminListParams {
  page: number;
  pageSize: number;
  search: string;
  sort: string;
  sortDir: "asc" | "desc";
  /** Optional ISO date range start */
  from?: string;
  to?: string;
  /** Feature-specific filters */
  userId?: string;
  projectId?: string;
  provider?: string;
  status?: string;
  severity?: string;
  /** Audit log action filter */
  action?: string;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function parseAdminListParams(
  searchParams: URLSearchParams,
  defaults?: { sort?: string; sortDir?: "asc" | "desc" }
): AdminListParams {
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );
  const sortDirRaw = searchParams.get("sortDir") ?? defaults?.sortDir ?? "desc";
  const sortDir = sortDirRaw === "asc" ? "asc" : "desc";

  return {
    page,
    pageSize,
    search: (searchParams.get("search") ?? "").trim().toLowerCase(),
    sort: searchParams.get("sort") ?? defaults?.sort ?? "lastActive",
    sortDir,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    userId: searchParams.get("userId") ?? undefined,
    projectId: searchParams.get("projectId") ?? undefined,
    provider: searchParams.get("provider") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    severity: searchParams.get("severity") ?? undefined,
    action: searchParams.get("action") ?? undefined,
  };
}

export function adminListFiltersKey(params: AdminListParams): Record<string, unknown> {
  return {
    page: params.page,
    pageSize: params.pageSize,
    search: params.search,
    sort: params.sort,
    sortDir: params.sortDir,
    from: params.from ?? "",
    to: params.to ?? "",
    userId: params.userId ?? "",
    projectId: params.projectId ?? "",
    provider: params.provider ?? "",
    status: params.status ?? "",
    severity: params.severity ?? "",
    action: params.action ?? "",
  };
}
