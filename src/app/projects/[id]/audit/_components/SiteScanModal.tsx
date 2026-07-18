"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Search, CheckCircle2, Loader2 } from "lucide-react";
import { Dialog } from "@/components/common/dialogs/Dialog";
import { getSiteAuditPlan, startSiteAudit, type ScanPlanCategory } from "@/app/actions/site-audit-actions";
import { cn } from "@/lib/cn";

/**
 * Pre-scan planner. Before a site-wide scan runs, the user picks exactly which
 * pages (grouped by category) to audit. Content-like pages are pre-selected;
 * product/landing pages are not. Already-audited pages are shown, locked, and
 * excluded by default — a "re-scan audited" toggle opts them back in. This keeps
 * scans fast and avoids spending time on pages the user doesn't care about.
 */
export function SiteScanModal({
  projectId,
  open,
  onClose,
  onStarted,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onStarted: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<ScanPlanCategory[]>([]);
  const [auditedCount, setAuditedCount] = useState(0);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [reScanAudited, setReScanAudited] = useState(false);
  const [search, setSearch] = useState("");
  const [starting, setStarting] = useState(false);

  // Load the plan when opened; pre-select suggested, not-yet-audited pages.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      const res = await getSiteAuditPlan(projectId);
      if (cancelled) return;
      if (!res.success) {
        setError(res.error ?? "Could not load pages");
        setLoading(false);
        return;
      }
      setCategories(res.categories);
      setAuditedCount(res.auditedCount);
      const preselect = new Set<string>();
      res.categories.forEach(c => c.pages.forEach(p => {
        if (p.suggested && !p.audited) preselect.add(p.url);
      }));
      setSelected(preselect);
      setExpanded(new Set(res.categories.slice(0, 1).map(c => c.key)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, projectId]);

  // A page is selectable unless it's already audited and we're not re-scanning.
  const isLocked = useCallback(
    (audited: boolean) => audited && !reScanAudited,
    [reScanAudited],
  );

  const togglePage = useCallback((url: string, audited: boolean) => {
    if (isLocked(audited)) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
  }, [isLocked]);

  const toggleCategory = useCallback((cat: ScanPlanCategory, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      cat.pages.forEach(p => {
        if (isLocked(p.audited)) return;
        if (checked) next.add(p.url); else next.delete(p.url);
      });
      return next;
    });
  }, [isLocked]);

  // Toggle re-scanning audited pages: adds/removes every audited page from the
  // selection in one step (event-driven, so no cascading-effect churn).
  const toggleReScan = useCallback((checked: boolean) => {
    setReScanAudited(checked);
    setSelected(prev => {
      const next = new Set(prev);
      categories.forEach(c => c.pages.forEach(p => {
        if (!p.audited) return;
        if (checked) next.add(p.url); else next.delete(p.url);
      }));
      return next;
    });
  }, [categories]);

  const visibleCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories
      .map(c => ({ ...c, pages: c.pages.filter(p => p.title.toLowerCase().includes(q) || p.url.toLowerCase().includes(q)) }))
      .filter(c => c.pages.length > 0);
  }, [categories, search]);

  const start = useCallback(async () => {
    if (!selected.size) return;
    setStarting(true);
    setError(null);
    try {
      const res = await startSiteAudit(projectId, [...selected]);
      if (!res.success) { setError(res.error ?? "Could not start scan"); return; }
      onStarted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start scan");
    } finally {
      setStarting(false);
    }
  }, [projectId, selected, onStarted, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Choose pages to scan"
      description="Pick which pages to health-check. Product and landing pages are unselected by default. It's free — no AI credits used."
      closeOnBackdrop={!starting}
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <label className="flex items-center gap-2 text-[12px] text-text-secondary cursor-pointer select-none">
            <input type="checkbox" checked={reScanAudited} onChange={e => toggleReScan(e.target.checked)} className="accent-brand-violet h-3.5 w-3.5" />
            Re-scan {auditedCount} already-audited page{auditedCount === 1 ? "" : "s"}
          </label>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="h-9 px-4 rounded-full border border-border-subtle text-[13px] text-text-secondary hover:bg-surface-secondary">
              Cancel
            </button>
            <button
              onClick={start}
              disabled={!selected.size || starting}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-brand-violet text-white text-[13px] font-semibold hover:bg-brand-violet/90 disabled:opacity-50"
            >
              {starting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Scan {selected.size} page{selected.size === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3 min-h-[300px]">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-tertiary pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search pages…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-border-subtle bg-surface-elevated text-[13px] text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-brand-violet/40"
          />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 justify-center text-[13px] text-text-tertiary">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your pages…
          </div>
        ) : error ? (
          <p className="py-10 text-center text-[13px] text-brand-coral">{error}</p>
        ) : !categories.length ? (
          <p className="py-10 text-center text-[13px] text-text-tertiary">
            No pages found. Add a sitemap in Settings first.
          </p>
        ) : (
          // Scrollable category list.
          <div className="max-h-[46vh] overflow-y-auto rounded-xl border border-border-subtle divide-y divide-border-subtle/60">
            {visibleCategories.map(cat => {
              const selectable = cat.pages.filter(p => !isLocked(p.audited));
              const selectedCount = selectable.filter(p => selected.has(p.url)).length;
              const allSelected = selectable.length > 0 && selectedCount === selectable.length;
              const isOpen = expanded.has(cat.key) || search.trim().length > 0;
              return (
                <div key={cat.key}>
                  {/* Category header */}
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-surface-secondary/30">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = selectedCount > 0 && !allSelected; }}
                      onChange={e => toggleCategory(cat, e.target.checked)}
                      className="accent-brand-violet h-4 w-4"
                    />
                    <button
                      onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(cat.key)) n.delete(cat.key); else n.add(cat.key); return n; })}
                      className="flex flex-1 items-center gap-2 text-left min-w-0"
                    >
                      <ChevronDown className={cn("h-4 w-4 text-text-tertiary shrink-0 transition-transform", isOpen && "rotate-180")} />
                      <span className="text-[13px] font-semibold text-text-primary truncate">{cat.label}</span>
                      <span className="text-[11px] text-text-tertiary shrink-0">
                        {selectedCount}/{cat.pages.length} selected
                      </span>
                    </button>
                  </div>

                  {/* Pages */}
                  {isOpen && (
                    <ul>
                      {cat.pages.map(p => {
                        const locked = isLocked(p.audited);
                        const checked = locked ? false : selected.has(p.url);
                        return (
                          <li key={p.url}>
                            <label className={cn("flex items-center gap-2.5 pl-9 pr-3 py-2 cursor-pointer hover:bg-surface-hover", locked && "cursor-default opacity-70")}>
                              <input
                                type="checkbox"
                                checked={checked || (p.audited && !reScanAudited)}
                                disabled={locked}
                                onChange={() => togglePage(p.url, p.audited)}
                                className="accent-brand-violet h-4 w-4 shrink-0"
                              />
                              <span className="text-[12px] text-text-primary truncate flex-1 min-w-0">{p.title}</span>
                              {p.audited && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-status-success shrink-0">
                                  <CheckCircle2 className="h-3 w-3" /> Audited
                                </span>
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
}
