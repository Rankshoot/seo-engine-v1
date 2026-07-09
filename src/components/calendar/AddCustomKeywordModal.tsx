"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, Button, Field, Input, Select } from "@/components/common";
import { CalendarDatePicker } from "@/components/CalendarDatePicker";

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function localTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Earliest date (starting today) with no entry yet scheduled on it. */
function earliestVacantDate(scheduledDatesSet: Map<string, number>): string {
  const base = new Date();
  for (let i = 0; i < 500; i++) {
    const cur = new Date(base);
    cur.setDate(base.getDate() + i);
    const iso = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    if (!scheduledDatesSet.has(iso)) return iso;
  }
  return localTodayISO();
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
  /** If coming from a grid cell click, the date is pre-filled. Null = default to the next free date. */
  preselectedDate?: string | null;
  /** date → number of entries already scheduled on that date, for the dot-indicator picker. */
  entryCountByDate?: Map<string, number>;
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
  entryCountByDate,
  onSubmit,
  busy = false,
}: AddCustomKeywordModalProps) {
  const [keyword, setKeyword] = useState("");
  const [articleType, setArticleType] = useState("Blog Post");
  const [selectedDate, setSelectedDate] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keywordRef = useRef<HTMLInputElement>(null);

  const datesMap = useMemo(() => entryCountByDate ?? new Map<string, number>(), [entryCountByDate]);
  const scheduledDates = useMemo(() => new Set(datesMap.keys()), [datesMap]);
  const multiScheduledDates = useMemo(
    () => new Set([...datesMap].filter(([, count]) => count > 1).map(([date]) => date)),
    [datesMap]
  );

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      setKeyword("");
      setArticleType("Blog Post");
      setSelectedDate(preselectedDate || earliestVacantDate(datesMap));
      setError(null);
      keywordRef.current?.focus();
    }, 60);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselectedDate]);

  const entriesOnSelectedDate = selectedDate ? (datesMap.get(selectedDate) ?? 0) : 0;

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
      targetDate: selectedDate || undefined,
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
      description="Choose a keyword, article type, and publish date."
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

        <Field label="Publish date" htmlFor="ack-date">
          <div className="flex items-center justify-between gap-3 rounded-[10px] border border-border-subtle bg-surface-secondary/50 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-text-primary">
                {selectedDate ? fmtDate(selectedDate) : "Next free date"}
              </p>
              {entriesOnSelectedDate > 0 && (
                <p className="mt-0.5 text-[11px] text-status-warning">
                  Adding alongside {entriesOnSelectedDate} existing {entriesOnSelectedDate === 1 ? "entry" : "entries"} that day
                </p>
              )}
            </div>
            <CalendarDatePicker
              open={datePickerOpen}
              onOpenChange={setDatePickerOpen}
              currentDate={selectedDate}
              onConfirm={setSelectedDate}
              saving={busy}
              scheduledDates={scheduledDates}
              multiScheduledDates={multiScheduledDates}
              variant="pick"
              label="Change date"
            />
          </div>
        </Field>

        {error && (
          <p className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-[13px] text-status-danger">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}
