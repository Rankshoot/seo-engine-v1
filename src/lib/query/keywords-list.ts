import { keywordsApi } from "@/frontend/api/keywords";
import { qk } from "./keys";
import { DEFAULT_QUERY_OPTIONS } from "./defaults";

/** First `getKeywords` pending page size — server clamps this request to 200. */
export const KEYWORDS_LIST_INITIAL_LIMIT = 200;

async function fetchAllKeywordsPages(projectId: string) {
  const first = await keywordsApi.list(projectId, { limit: KEYWORDS_LIST_INITIAL_LIMIT, offset: 0 });
  if (!first.success) return first;

  let data = [...first.data];
  const total = first.total;

  while (data.length < total) {
    const pendingOffset = data.filter(k => k.status === "pending").length;
    // `loadMoreKeywords` clamps limit to 100 — keep in sync with keyword-actions.
    const more = await keywordsApi.loadMore(projectId, pendingOffset, 100);
    if (!more.success) return more;
    const seen = new Set(data.map(k => k.id));
    const fresh = more.data.filter(k => !seen.has(k.id));
    if (fresh.length === 0) break;
    data = [...data, ...fresh];
  }

  return { ...first, data, total };
}

export function keywordsListQueryOptions(projectId: string) {
  return {
    queryKey: qk.keywords(projectId),
    queryFn: () => fetchAllKeywordsPages(projectId),
    ...DEFAULT_QUERY_OPTIONS,
  } as const;
}

