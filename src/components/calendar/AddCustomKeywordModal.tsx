"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, Button, Field, Input, Select } from "@/components/common";

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const SUPPORTED_ARTICLE_TYPES = [
  { value: "Blog Post", label: "Blog article" },
  { value: "Ebook", label: "Ebook" },
  { value: "Whitepaper", label: "Whitepaper" },
  { value: "LinkedIn Post", label: "LinkedIn Post" },
] as const;

export interface AddCustomKeywordModalProps {
  open: boolean;
  onClose: () => void;
  /** If coming from a grid cell click, the date is pre-filled. Null = use next vacant date. */
  preselectedDate?: string | null;
  onSubmit: (data: {
    keyword: string;
    title: string;
    articleType: string;
    writerNotes: string;
    targetDate?: string;
  }) => Promise<{ success: boolean; error?: string; scheduled_date?: string }>;
  busy?: boolean;
}

export function AddCustomKeywordModal({
  open,
  onClose,
  preselectedDate,
  onSubmit,
  busy = false,
}: AddCustomKeywordModalProps) {
  const [keyword, setKeyword] = useState("");
  const [articleType, setArticleType] = useState("Blog Post");
  const [error, setError] = useState<string | null>(null);
  const keywordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setKeyword("");
      setArticleType("Blog Post");
      setError(null);
      keywordRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) {
      setError("Keyword is required");
      return;
    }
    setError(null);
    const res = await onSubmit({
      keyword: keyword.trim(),
      title: "",
      articleType,
      writerNotes: "",
      targetDate: preselectedDate ?? undefined,
    });
    if (!res.success) setError(res.error ?? "Something went wrong");
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      title="Add keyword to calendar"
      description={
        preselectedDate
          ? `Will be scheduled for ${fmtDate(preselectedDate)}`
          : "Will be placed on the next free date automatically"
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="add-custom-keyword-form"
            variant="primary"
            loading={busy}
            disabled={busy || !keyword.trim()}
          >
            {busy ? "Scheduling…" : "Add to calendar"}
          </Button>
        </>
      }
    >
      <form id="add-custom-keyword-form" onSubmit={handleSubmit} className="space-y-5">
        <Field
          label="Focus keyword"
          required
          htmlFor="ack-keyword"
        >
          <Input
            id="ack-keyword"
            ref={keywordRef}
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="e.g. best CRM for small business"
          />
        </Field>

        <Field label="Article type" htmlFor="ack-type">
          <Select id="ack-type" value={articleType} onChange={e => setArticleType(e.target.value)}>
            {SUPPORTED_ARTICLE_TYPES.map(t => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>

        {error && (
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-400">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
