import { keywordsApi } from "@/frontend/api/keywords";
import { qk } from "./keys";
import { DEFAULT_QUERY_OPTIONS } from "./defaults";
import { executeSafeQuery } from "./safe-query";

/** First `getKeywords` pending page size — server clamps this request to 200. */
export const KEYWORDS_LIST_INITIAL_LIMIT = 200;

async function fetchAllKeywordsPages(projectId: string) {
  return keywordsApi.list(projectId);
}

export function keywordsListQueryOptions(projectId: string) {
  return {
    queryKey: qk.keywords(projectId),
    queryFn: () => executeSafeQuery(() => fetchAllKeywordsPages(projectId)),
    ...DEFAULT_QUERY_OPTIONS,
  } as const;
}

