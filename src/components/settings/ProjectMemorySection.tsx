"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Brain, Pencil, Trash2, Check, X, AlertCircle } from "lucide-react";
import {
  getProjectMemory,
  updateProjectMemoryEntry,
  deleteProjectMemoryEntry,
  clearProjectMemory,
} from "@/app/actions/memory-actions";
import type { ProjectMemoryEntry } from "@/lib/ai-memory";

const KIND_LABELS: Record<string, string> = {
  topic_covered: "Topics covered",
  style: "Style learnings",
  preference: "Your preferences",
  audience_insight: "Audience insights",
  activity: "Recent activity",
};

const KIND_ORDER = ["preference", "style", "audience_insight", "topic_covered", "activity"];

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-[2px] border-border-subtle border-t-text-secondary"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Settings → Project memory. Shows the ENTIRE memory the Rankshoot AI has
 * accumulated for this project and gives the user full control: edit any
 * entry, delete any entry, or clear everything. Deletes are permanent — the
 * AI never uses a removed memory again; it re-learns only from new work.
 */
export function ProjectMemorySection() {
  const { id: projectId } = useParams<{ id: string }>();

  const [entries, setEntries] = useState<ProjectMemoryEntry[]>([]);
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getProjectMemory(projectId);
      if (cancelled) return;
      if (res.success) {
        setEntries(res.entries);
        setClearedAt(res.clearedAt);
        setError(null);
      } else {
        setError(res.error ?? "Failed to load memory");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const startEdit = (entry: ProjectMemoryEntry) => {
    setEditingId(entry.id);
    setEditText(entry.content);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setBusyId(editingId);
    const res = await updateProjectMemoryEntry(projectId, editingId, editText);
    if (res.success) {
      setEntries((prev) =>
        prev.map((e) => (e.id === editingId ? { ...e, content: editText.trim(), source: "user" } : e))
      );
      setEditingId(null);
    } else {
      setError(res.error ?? "Failed to save");
    }
    setBusyId(null);
  };

  const removeEntry = async (entryId: string) => {
    setBusyId(entryId);
    const res = await deleteProjectMemoryEntry(projectId, entryId);
    if (res.success) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } else {
      setError(res.error ?? "Failed to delete");
    }
    setBusyId(null);
  };

  const clearAll = async () => {
    setClearing(true);
    const res = await clearProjectMemory(projectId);
    if (res.success) {
      setEntries([]);
      setClearedAt(new Date().toISOString());
    } else {
      setError(res.error ?? "Failed to clear memory");
    }
    setClearing(false);
    setConfirmClear(false);
  };

  // Group entries by kind in a stable, meaningful order.
  const grouped = KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABELS[kind] ?? kind,
    items: entries.filter((e) => e.kind === kind),
  })).filter((g) => g.items.length > 0);
  const otherItems = entries.filter((e) => !KIND_ORDER.includes(e.kind));
  if (otherItems.length) grouped.push({ kind: "other", label: "Other", items: otherItems });

  return (
    <section className="space-y-3">
      <h2 className="text-[15px] font-semibold text-text-primary">Project Memory</h2>

      <div className="rounded-[16px] border border-border-subtle bg-surface-elevated overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-border-subtle/60">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-subtle bg-surface-primary">
              <Brain className="h-4 w-4 text-text-secondary" />
            </div>
            <div>
              <p className="text-[13px] font-medium text-text-primary">What the AI remembers about this project</p>
              <p className="text-[12px] text-text-tertiary">
                Builds automatically as you generate content. Edit or delete anything — deleted memory is
                never used again.
              </p>
            </div>
          </div>

          {entries.length > 0 && (
            confirmClear ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={clearAll}
                  disabled={clearing}
                  className="inline-flex items-center gap-1.5 rounded-full border border-brand-coral/40 bg-brand-coral/10 px-3 py-1.5 text-[12px] font-semibold text-brand-coral hover:bg-brand-coral/20 disabled:opacity-60"
                >
                  {clearing ? <Spinner size={12} /> : <Trash2 className="h-3 w-3" />}
                  Yes, forget everything
                </button>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="rounded-full border border-border-subtle px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-secondary"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-secondary"
              >
                <Trash2 className="h-3 w-3" />
                Clear all
              </button>
            )
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {error && (
            <p className="flex items-center gap-1.5 text-[12px] text-brand-coral">
              <AlertCircle className="h-3.5 w-3.5" /> {error}
            </p>
          )}

          {loading ? (
            <div className="flex items-center gap-2 py-2 text-[13px] text-text-tertiary">
              <Spinner /> Loading memory…
            </div>
          ) : entries.length === 0 ? (
            <p className="py-2 text-[13px] text-text-tertiary">
              No memory yet — it builds automatically as you generate blogs and run audits in this project.
              {clearedAt && (
                <span className="block mt-1 text-[12px]">
                  Memory was cleared on {new Date(clearedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}.
                  The AI is starting fresh.
                </span>
              )}
            </p>
          ) : (
            grouped.map((group) => (
              <div key={group.kind}>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                  {group.label}
                </p>
                <ul className="space-y-2">
                  {group.items.map((entry) => (
                    <li
                      key={entry.id}
                      className="group flex items-start gap-2 rounded-xl border border-border-subtle bg-surface-primary px-3 py-2"
                    >
                      {editingId === entry.id ? (
                        <>
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={2}
                            maxLength={500}
                            className="flex-1 resize-none rounded-lg border border-border-subtle bg-surface-elevated px-2 py-1.5 text-[13px] text-text-primary outline-none focus:border-text-tertiary"
                          />
                          <div className="flex shrink-0 items-center gap-1 pt-1">
                            <button
                              onClick={saveEdit}
                              disabled={busyId === entry.id || !editText.trim()}
                              className="rounded-lg p-1.5 text-status-success hover:bg-surface-secondary disabled:opacity-50"
                              title="Save"
                            >
                              {busyId === entry.id ? <Spinner size={13} /> : <Check className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-secondary"
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="flex-1 text-[13px] leading-relaxed text-text-primary">{entry.content}</p>
                          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => startEdit(entry)}
                              className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-secondary hover:text-text-primary"
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => removeEntry(entry.id)}
                              disabled={busyId === entry.id}
                              className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-secondary hover:text-brand-coral"
                              title="Delete permanently"
                            >
                              {busyId === entry.id ? <Spinner size={13} /> : <Trash2 className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
