"use client";

import { useEffect, useRef, useState } from "react";
import { ARTICLE_TYPES } from "@/lib/types";
import { Dialog, Button, Field, Input, Select, Textarea } from "@/components/common";

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const BLOG_ARTICLE_TYPES = (ARTICLE_TYPES as readonly string[]).filter(t => t !== "Repair");

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
  const [title, setTitle] = useState("");
  const [articleType, setArticleType] = useState("Blog Post");
  const [writerNotes, setWriterNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const keywordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setKeyword("");
      setTitle("");
      setArticleType("Blog Post");
      setWriterNotes("");
      setError(null);
      setTimeout(() => keywordRef.current?.focus(), 60);
    }
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
      title: title.trim(),
      articleType,
      writerNotes: writerNotes.trim(),
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

        <Field
          label={
            <>
              Blog title{" "}
              <span className="font-normal normal-case tracking-normal text-text-tertiary/70">
                (optional — defaults to keyword)
              </span>
            </>
          }
          htmlFor="ack-title"
        >
          <Input
            id="ack-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. 7 Best CRM Tools for Small Businesses in 2026"
          />
        </Field>

        <Field label="Article type" htmlFor="ack-type">
          <Select id="ack-type" value={articleType} onChange={e => setArticleType(e.target.value)}>
            <option value="Blog Post">Blog Post</option>
            {BLOG_ARTICLE_TYPES.filter(t => t !== "Blog Post" && t !== "Repair").map(t => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={
            <>
              Writer notes{" "}
              <span className="font-normal normal-case tracking-normal text-text-tertiary/70">
                (brief, tone, extra instructions for the AI)
              </span>
            </>
          }
          htmlFor="ack-notes"
        >
          <Textarea
            id="ack-notes"
            value={writerNotes}
            onChange={e => setWriterNotes(e.target.value)}
            placeholder="e.g. Target audience: founders. Focus on integrations with Slack and HubSpot. Keep tone conversational."
            rows={3}
            className="resize-none"
          />
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
