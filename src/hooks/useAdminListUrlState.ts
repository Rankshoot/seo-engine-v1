"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { AdminListParams } from "@/lib/admin/parse-list-params";
import { parseAdminListParams } from "@/lib/admin/parse-list-params";
import { buildAdminListQueryString } from "@/lib/admin/build-list-query";

export function useAdminListUrlState(
  sortDefault: string,
  sortDirDefault: "asc" | "desc" = "desc"
) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const params = useMemo(
    () =>
      parseAdminListParams(searchParams, {
        sort: sortDefault,
        sortDir: sortDirDefault,
      }),
    [searchParams, sortDefault, sortDirDefault]
  );

  const setParams = useCallback(
    (patch: Partial<AdminListParams>, options?: { resetPage?: boolean }) => {
      const resetPage = options?.resetPage ?? true;
      const next: AdminListParams = {
        ...params,
        ...patch,
        ...( "userId" in patch && !patch.userId ? { userId: undefined } : {}),
        ...( "projectId" in patch && !patch.projectId ? { projectId: undefined } : {}),
        ...( "provider" in patch && !patch.provider ? { provider: undefined } : {}),
        ...( "status" in patch && !patch.status ? { status: undefined } : {}),
        ...( "severity" in patch && !patch.severity ? { severity: undefined } : {}),
        ...( "action" in patch && !patch.action ? { action: undefined } : {}),
        page:
          patch.page !== undefined
            ? patch.page
            : resetPage &&
                (patch.search !== undefined ||
                  patch.sort !== undefined ||
                  patch.sortDir !== undefined ||
                  patch.userId !== undefined ||
                  patch.projectId !== undefined ||
                  patch.provider !== undefined ||
                  patch.status !== undefined ||
                  patch.severity !== undefined ||
                  patch.action !== undefined ||
                  patch.from !== undefined ||
                  patch.to !== undefined)
              ? 1
              : params.page,
      };
      const qs = buildAdminListQueryString(next);
      router.push(`${pathname}${qs}`, { scroll: false });
    },
    [params, pathname, router]
  );

  return { params, setParams };
}
