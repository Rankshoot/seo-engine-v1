"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Search, ExternalLink, RefreshCw, FileText, Layers } from "lucide-react";
import { listSitemapLinks, type SitemapLinkItem } from "@/app/actions/sitemap-actions";

const PAGE_SIZE = 50;

/**
 * View-only modal listing the internal-link URLs captured from a project's
 * sitemap. Paginated for large sites; supports a quick text filter and a
 * refresh hook (the parent owns the actual re-sync action).
 */
export function SitemapLinksModal({
  open,
  projectId,
  totalHint,
  onClose,
  onRefresh,
  refreshing,
}: {
  open: boolean;
  projectId: string;
  totalHint?: number;
  onClose: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const [items, setItems] = useState<SitemapLinkItem[]>([]);
  const [total, setTotal] = useState(totalHint ?? 0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (pageIndex: number, searchTerm: string) => {
      setLoading(true);
      try {
        const res = await listSitemapLinks(projectId, {
          limit: PAGE_SIZE,
          offset: pageIndex * PAGE_SIZE,
          search: searchTerm || undefined,
        });
        if (res.success) {
          setItems(res.items);
          setTotal(res.total);
        }
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    if (!open) return;
    setPage(0);
    void load(0, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Debounce search.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      setPage(0);
      void load(0, search);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const goto = (p: number) => {
    const clamped = Math.min(Math.max(p, 0), totalPages - 1);
    setPage(clamped);
    void load(clamped, search);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-[16px] border border-border-subtle bg-surface-elevated shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-text-primary">Sitemap pages</h2>
            <p className="mt-0.5 text-[12px] text-text-tertiary">
              {total.toLocaleString()} URL{total === 1 ? "" : "s"} used for internal linking
            </p>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-border-subtle px-3 py-1.5 text-xs font-medium text-text-secondary transition-all hover:border-brand-violet/40 hover:text-text-primary disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Refreshing…" : "Refresh"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-border-subtle px-5 py-3">
          <div className="flex items-center gap-2 rounded-[8px] border border-border-subtle bg-surface-secondary px-3">
            <Search className="h-3.5 w-3.5 text-text-tertiary" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter by URL or title…"
              className="h-9 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none"
            />
          </div>
        </div>

        {/* List */}
        <div className="min-h-[200px] flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="space-y-2 p-3">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-10 animate-pulse rounded-[8px] bg-surface-tertiary/50" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-text-tertiary">
              <Layers className="h-6 w-6" />
              <p className="text-sm">No pages found.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border-subtle/60">
              {items.map(item => (
                <li key={item.url} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-semibold ${
                      item.kind === "blog"
                        ? "bg-brand-violet/10 text-brand-violet"
                        : "bg-surface-secondary text-text-tertiary"
                    }`}
                  >
                    <FileText className="h-3 w-3" />
                    {item.kind === "blog" ? "Blog" : "Page"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-text-primary">{item.title || item.url}</p>
                    <p className="truncate text-[11px] text-text-tertiary">{item.url}</p>
                  </div>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-text-tertiary transition-colors hover:text-brand-violet"
                    aria-label="Open page"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border-subtle px-5 py-3 text-[12px] text-text-tertiary">
            <span>Page {page + 1} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goto(page - 1)}
                disabled={page === 0 || loading}
                className="rounded-[8px] border border-border-subtle px-3 py-1.5 font-medium text-text-secondary transition-all hover:text-text-primary disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => goto(page + 1)}
                disabled={page >= totalPages - 1 || loading}
                className="rounded-[8px] border border-border-subtle px-3 py-1.5 font-medium text-text-secondary transition-all hover:text-text-primary disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
