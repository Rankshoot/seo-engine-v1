"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/common";
import { Brain, Archive, ArchiveRestore, Trash2, RefreshCw, AlertCircle } from "lucide-react";
import {
  listGlobalHeuristics,
  setGlobalHeuristicStatus,
  deleteGlobalHeuristic,
} from "@/app/actions/admin-ai-memory-actions";
import type { GlobalHeuristicRow } from "@/lib/ai-memory";
import { cn } from "@/lib/cn";

const CATEGORY_COLORS: Record<string, string> = {
  structure: "border-brand-action/30 bg-brand-action/10 text-brand-action",
  style: "border-status-success/30 bg-status-success/10 text-status-success",
  seo: "border-brand-coral/30 bg-brand-coral/10 text-brand-coral",
  aeo: "border-border-subtle bg-surface-secondary text-text-secondary",
  geo: "border-border-subtle bg-surface-secondary text-text-secondary",
};

function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-[2px] border-border-subtle border-t-text-secondary"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Admin → AI Memory. Read + prune view of the GLOBAL Rankshoot AI learning
 * layer: anonymized, style-only heuristics learned across all users. This
 * layer silently improves generation in the backend and is never shown to
 * regular users — this tab exists so admins can audit what the AI has learned
 * and archive (or delete) anything off-base.
 */
export function AdminAiMemoryDashboard() {
  const [rows, setRows] = useState<GlobalHeuristicRow[]>([]);
  const [totals, setTotals] = useState({ active: 0, archived: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await listGlobalHeuristics();
      if (cancelled) return;
      if (res.success) {
        setRows(res.rows);
        setTotals({ active: res.totalActive, archived: res.totalArchived });
        setError(null);
      } else {
        setError(res.error ?? "Failed to load");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const manualRefresh = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  const toggleStatus = async (row: GlobalHeuristicRow) => {
    const next = row.status === "active" ? "archived" : "active";
    setBusyId(row.id);
    const res = await setGlobalHeuristicStatus(row.id, next);
    if (res.success) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: next } : r)));
      setTotals((t) =>
        next === "archived"
          ? { active: t.active - 1, archived: t.archived + 1 }
          : { active: t.active + 1, archived: t.archived - 1 }
      );
    } else {
      setError(res.error ?? "Failed to update");
    }
    setBusyId(null);
  };

  const remove = async (row: GlobalHeuristicRow) => {
    setBusyId(row.id);
    const res = await deleteGlobalHeuristic(row.id);
    if (res.success) {
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setTotals((t) =>
        row.status === "active"
          ? { ...t, active: t.active - 1 }
          : { ...t, archived: t.archived - 1 }
      );
    } else {
      setError(res.error ?? "Failed to delete");
    }
    setBusyId(null);
  };

  return (
    <PageShell
      title="AI Memory"
      subtitle="What Rankshoot AI has learned globally — anonymized, style-only writing patterns. Active entries lightly guide every generation; archive anything off-base."
      actions={
        <button
          onClick={manualRefresh}
          className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-secondary"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      }
    >
      {/* Totals */}
      <div className="flex gap-3">
        <div className="rounded-[14px] border border-border-subtle bg-surface-elevated px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Active</p>
          <p className="text-[20px] font-semibold text-text-primary">{totals.active}</p>
        </div>
        <div className="rounded-[14px] border border-border-subtle bg-surface-elevated px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">Archived</p>
          <p className="text-[20px] font-semibold text-text-primary">{totals.archived}</p>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-[13px] text-brand-coral">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}

      <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 px-5 py-8 text-[13px] text-text-tertiary">
            <Spinner /> Loading heuristics…
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
            <Brain className="h-6 w-6 text-text-tertiary" />
            <p className="text-[13px] text-text-secondary">Nothing learned yet.</p>
            <p className="max-w-md text-[12px] text-text-tertiary">
              Heuristics accumulate automatically as blogs are generated and scored across the platform.
              Only anonymized structural and style patterns are ever stored here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle/60">
            {rows.map((row) => (
              <li
                key={row.id}
                className={cn(
                  "flex items-start gap-3 px-5 py-3.5",
                  row.status === "archived" && "opacity-50"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    CATEGORY_COLORS[row.category] ?? CATEGORY_COLORS.style
                  )}
                >
                  {row.category}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-relaxed text-text-primary">{row.heuristic}</p>
                  <p className="mt-0.5 text-[11px] text-text-tertiary">
                    Evidence: {row.evidence_count} observation{row.evidence_count === 1 ? "" : "s"}
                    {" · "}
                    {new Date(row.updated_at).toLocaleDateString(undefined, { dateStyle: "medium" })}
                    {row.status === "archived" && " · archived"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => void toggleStatus(row)}
                    disabled={busyId === row.id}
                    className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-secondary hover:text-text-primary disabled:opacity-50"
                    title={row.status === "active" ? "Archive (stop using)" : "Restore"}
                  >
                    {busyId === row.id ? (
                      <Spinner size={13} />
                    ) : row.status === "active" ? (
                      <Archive className="h-3.5 w-3.5" />
                    ) : (
                      <ArchiveRestore className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => void remove(row)}
                    disabled={busyId === row.id}
                    className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-secondary hover:text-brand-coral disabled:opacity-50"
                    title="Delete permanently"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
