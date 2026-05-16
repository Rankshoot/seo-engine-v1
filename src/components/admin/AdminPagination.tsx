"use client";

import { cn } from "@/lib/cn";

export function AdminPagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-border-subtle bg-surface-secondary/40">
      <p className="text-[12px] text-text-tertiary tabular-nums">
        {total === 0 ? "No results" : `Showing ${from}–${to} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={cn(
            "h-8 px-3 rounded-md text-[12px] font-medium border border-border-subtle",
            page <= 1
              ? "opacity-40 cursor-not-allowed text-text-tertiary"
              : "text-text-secondary hover:bg-surface-hover"
          )}
        >
          Previous
        </button>
        <span className="text-[12px] text-text-tertiary tabular-nums px-1">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={cn(
            "h-8 px-3 rounded-md text-[12px] font-medium border border-border-subtle",
            page >= totalPages
              ? "opacity-40 cursor-not-allowed text-text-tertiary"
              : "text-text-secondary hover:bg-surface-hover"
          )}
        >
          Next
        </button>
      </div>
    </div>
  );
}

