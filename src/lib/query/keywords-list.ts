import { keywordsApi } from "@/frontend/api/keywords";
import { qk } from "./keys";

/** Server clamps to 200 — canonical first page for the shared project keywords cache. */
export const KEYWORDS_LIST_INITIAL_LIMIT = 200;

export function keywordsListQueryOptions(projectId: string) {
  return {
    queryKey: qk.keywords(projectId),
    queryFn: () =>
      keywordsApi.list(projectId, { limit: KEYWORDS_LIST_INITIAL_LIMIT, offset: 0 }),
  } as const;
}
