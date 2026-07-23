"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Button, Input, Spinner } from "@/components/common";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  listContentSources,
  createContentSourceUpload,
  finalizeContentSource,
  abortContentSource,
  addLinkContentSource,
  deleteContentSource,
  updateContentSourceScope,
  retryContentSource,
  type ContentSourceDTO,
} from "@/app/actions/content-source-actions";

/**
 * Project-level knowledge sources manager. Reusable across any content
 * generator: lists a project's uploaded reports/docs/links, lets the user add
 * new ones (file or URL), toggle whether a source is cited in EVERY blog
 * ("always") or only when picked, and select the "optional" sources to use for
 * the current draft.
 *
 * Selection is controlled by the parent (only `optional` sources are
 * selectable; `always` sources are implicitly included by the backend and never
 * appear in `selectedIds`).
 */

const ACCEPT = ".pdf,.docx,.txt,.md,.markdown";
const POLL_MS = 4000;

const STATUS_LABEL: Record<ContentSourceDTO["status"], string> = {
  pending: "Queued",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusPill({ status }: { status: ContentSourceDTO["status"] }) {
  const cls =
    status === "ready"
      ? "border-status-success/30 bg-status-success/10 text-status-success"
      : status === "failed"
        ? "border-status-danger/30 bg-status-danger/10 text-status-danger"
        : "border-border-subtle bg-surface-primary text-text-tertiary";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {(status === "pending" || status === "processing") && <Spinner size={10} />}
      {STATUS_LABEL[status]}
    </span>
  );
}

export const KnowledgeSourcesPanel = React.memo(function KnowledgeSourcesPanel({
  projectId,
  selectedIds,
  onSelectionChange,
}: {
  projectId: string;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  const [sources, setSources] = useState<ContentSourceDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  // Add-source form state.
  const [file, setFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [title, setTitle] = useState("");
  const [citeUrl, setCiteUrl] = useState("");
  const [always, setAlways] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await listContentSources(projectId);
    if (res.success) setSources(res.sources);
    setLoading(false);
    return res.success ? res.sources : [];
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll while any source is still ingesting; stop once all settle.
  const anyProcessing = sources.some((s) => s.status === "pending" || s.status === "processing");
  useEffect(() => {
    if (!anyProcessing) return;
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [anyProcessing, refresh]);

  // Drop selected ids that no longer exist or are no longer optional.
  useEffect(() => {
    if (loading) return;
    const selectable = new Set(sources.filter((s) => s.scope === "optional").map((s) => s.id));
    const pruned = selectedIds.filter((id) => selectable.has(id));
    if (pruned.length !== selectedIds.length) onSelectionChange(pruned);
  }, [sources, loading, selectedIds, onSelectionChange]);

  const toggleSelect = (id: string) => {
    onSelectionChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  };

  const resetForm = () => {
    setFile(null);
    setLinkUrl("");
    setTitle("");
    setCiteUrl("");
    setAlways(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setAdding(false);
  };

  const handleAdd = async () => {
    if (!file && !linkUrl.trim()) {
      toast.error("Choose a file or paste a URL.");
      return;
    }
    setBusy(true);
    try {
      if (file) {
        // Large files bypass the server-action body limit: get a signed upload
        // URL, stream the bytes straight to storage, then finalize (→ ingest).
        const created = await createContentSourceUpload(projectId, {
          filename: file.name,
          fileSize: file.size,
          mimeType: file.type || undefined,
          title: title.trim() || undefined,
          citeUrl: citeUrl.trim() || undefined,
          scope: always ? "always" : "optional",
        });
        if (!created.success || !created.ticket) {
          toast.error(created.error || "Could not start upload.");
          return;
        }
        const { sourceId, bucket, path, token } = created.ticket;
        try {
          const sb = createSupabaseBrowserClient();
          const { error: upErr } = await sb.storage
            .from(bucket)
            .uploadToSignedUrl(path, token, file, { contentType: file.type || undefined });
          if (upErr) throw upErr;
        } catch (e) {
          void abortContentSource(sourceId);
          toast.error(e instanceof Error ? e.message : "Upload failed.");
          return;
        }
        const fin = await finalizeContentSource(sourceId);
        if (!fin.success) {
          toast.error(fin.error || "Could not finish upload.");
          return;
        }
      } else {
        const res = await addLinkContentSource(projectId, {
          url: linkUrl.trim(),
          title: title.trim() || undefined,
          citeUrl: citeUrl.trim() || undefined,
          scope: always ? "always" : "optional",
        });
        if (!res.success) {
          toast.error(res.error || "Could not add source.");
          return;
        }
      }
      toast.success("Source added — processing in the background.");
      resetForm();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (s: ContentSourceDTO) => {
    setSources((prev) => prev.filter((x) => x.id !== s.id));
    onSelectionChange(selectedIds.filter((x) => x !== s.id));
    const res = await deleteContentSource(s.id);
    if (!res.success) {
      toast.error(res.error || "Could not delete source.");
      await refresh();
    }
  };

  const handleScopeToggle = async (s: ContentSourceDTO) => {
    const next = s.scope === "always" ? "optional" : "always";
    setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, scope: next } : x)));
    if (next === "always") onSelectionChange(selectedIds.filter((x) => x !== s.id));
    const res = await updateContentSourceScope(s.id, next);
    if (!res.success) {
      toast.error(res.error || "Could not update source.");
      await refresh();
    }
  };

  const handleRetry = async (s: ContentSourceDTO) => {
    setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, status: "pending", error: "" } : x)));
    await retryContentSource(s.id);
    await refresh();
  };

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-elevated p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-text-primary mb-0.5">Knowledge sources</p>
          <p className="text-[11px] text-text-tertiary leading-relaxed">
            Upload reports, docs, or reference links. The AI pulls relevant data points from them and cites + links them where they genuinely fit. Mark a source <span className="font-medium">Always</span> to cite it in every blog.
          </p>
        </div>
        {!adding && (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            + Add source
          </Button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <div className="mt-3 space-y-2.5 rounded-lg border border-border-subtle bg-surface-primary p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title.trim()) setTitle(f.name.replace(/\.[^.]+$/i, ""));
              }}
              className="block w-full text-[12px] text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-text-primary file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-surface-primary hover:file:opacity-90"
            />
          </div>
          <p className="text-center text-[10px] uppercase tracking-wider text-text-tertiary">or</p>
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="Paste a reference URL (https://…)"
            disabled={!!file}
          />
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. India Decoding Jobs 2026)" />
          <Input
            value={citeUrl}
            onChange={(e) => setCiteUrl(e.target.value)}
            placeholder="Link to cite / interlink (e.g. the report's web page)"
          />
          <label className="flex items-center gap-2 text-[12px] text-text-secondary">
            <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} className="h-3.5 w-3.5 accent-brand-action" />
            Always cite this in every blog for this project
          </label>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={handleAdd} disabled={busy}>
              {busy ? "Adding…" : "Add source"}
            </Button>
            <Button variant="ghost" size="sm" onClick={resetForm} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-[12px] text-text-tertiary">
            <Spinner size={14} /> Loading sources…
          </div>
        ) : sources.length === 0 ? (
          !adding && <p className="text-[12px] text-text-tertiary">No sources yet.</p>
        ) : (
          sources.map((s) => {
            const selectable = s.scope === "optional" && s.status === "ready";
            const checked = s.scope === "always" || selectedIds.includes(s.id);
            return (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-primary px-3 py-2">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!selectable}
                  onChange={() => selectable && toggleSelect(s.id)}
                  title={s.scope === "always" ? "Always included" : s.status !== "ready" ? "Available once ready" : "Use for this blog"}
                  className="h-4 w-4 shrink-0 accent-brand-action disabled:opacity-50"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[12px] font-medium text-text-primary">{s.title}</span>
                    {s.scope === "always" && (
                      <span className="shrink-0 rounded-full border border-brand-action/40 bg-brand-action/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-action">
                        Always
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[10px] text-text-tertiary">
                    {s.kind === "link" ? s.sourceUrl : `${s.originalFilename ?? "file"}${s.fileSizeBytes ? ` · ${formatBytes(s.fileSizeBytes)}` : ""}`}
                    {s.status === "ready" && s.chunkCount > 0 ? ` · ${s.chunkCount} sections` : ""}
                    {s.status === "failed" && s.error ? ` · ${s.error}` : ""}
                  </p>
                </div>
                <StatusPill status={s.status} />
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleScopeToggle(s)}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary hover:text-text-primary"
                    title={s.scope === "always" ? "Make optional (pick per blog)" : "Always cite in every blog"}
                  >
                    {s.scope === "always" ? "Make optional" : "Set always"}
                  </button>
                  {s.status === "failed" && (
                    <button
                      type="button"
                      onClick={() => handleRetry(s)}
                      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-brand-action hover:opacity-80"
                    >
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(s)}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-text-tertiary hover:text-status-danger"
                    title="Delete source"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
