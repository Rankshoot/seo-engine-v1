"use client";

import { useRef, useState, type ChangeEvent } from "react";
import type { Editor } from "@tiptap/react";
import { cn } from "@/lib/cn";
import { Dialog, Button, Input, Field } from "@/components/common";

/* ── Shared button style ────────────────────────────────────────────── */
const BTN_BASE =
  "inline-flex h-11 min-w-[2.75rem] items-center justify-center gap-1 rounded-lg px-3.5 text-[15px] font-medium transition-all select-none cursor-pointer";

function ToolBtn({
  onClick,
  active,
  title,
  children,
  className,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={e => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        BTN_BASE,
        active
          ? "bg-text-primary text-surface-primary shadow-sm"
          : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return (
    <span className="mx-1 h-6 w-px shrink-0 rounded-full bg-border-subtle" aria-hidden />
  );
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

/* ── Toolbar ────────────────────────────────────────────────────────── */
export function TipTapFormatToolbar({
  editor,
  className,
}: {
  editor: Editor | null;
  className?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<"link" | "youtube">("link");
  const [urlInput, setUrlInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  if (!editor) return null;

  /* Image file upload → base64 → TipTap */
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const src = ev.target?.result as string;
      if (src) {
        editor.chain().focus().setImage({ src, alt: file.name.replace(/\.[^.]+$/, "") }).run();
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const insertLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    setModalType("link");
    setUrlInput(prev ?? "");
    setErrorMsg("");
    setModalOpen(true);
  };

  const insertYoutube = () => {
    setModalType("youtube");
    setUrlInput("");
    setErrorMsg("");
    setModalOpen(true);
  };

  const handleModalSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = urlInput.trim();
    if (modalType === "link") {
      if (!trimmed) {
        editor.chain().focus().unsetLink().run();
        setModalOpen(false);
        return;
      }
      editor.chain().focus().setLink({ href: trimmed }).run();
      setModalOpen(false);
    } else {
      if (!trimmed) {
        setErrorMsg("Please enter a YouTube video URL");
        return;
      }
      editor.chain().focus().setYoutubeVideo({ src: trimmed }).run();
      setModalOpen(false);
    }
  };

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  };

  return (
    /* Outer container with 4-side border + shadow */
    <div
      className={cn(
        "mx-auto w-full max-w-[860px] rounded-xl border border-border-default bg-surface-elevated overflow-hidden",
        "shadow-[0_10px_25px_-5px_rgba(0,0,0,0.15),0_8px_16px_-6px_rgba(0,0,0,0.15)]",
        className,
      )}
    >
      <div
        role="toolbar"
        aria-label="Text formatting"
        className="flex flex-nowrap items-center justify-between gap-1 px-4 py-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onMouseDown={e => e.preventDefault()}
      >
        {/* Text style */}
        <Group>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleBold().run()}
            active={editor.isActive("bold")}
            title="Bold (Ctrl+B)"
          >
            <strong className="text-[16px]">B</strong>
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleItalic().run()}
            active={editor.isActive("italic")}
            title="Italic (Ctrl+I)"
          >
            <em className="text-[16px]">I</em>
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleStrike().run()}
            active={editor.isActive("strike")}
            title="Strikethrough"
          >
            <span className="text-[16px] line-through">S</span>
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleCode().run()}
            active={editor.isActive("code")}
            title="Inline code"
          >
            <span className="font-mono text-[14px]">{"`"}</span>
          </ToolBtn>
        </Group>

        <Sep />

        {/* Headings */}
        <Group>
          {([1, 2, 3] as const).map(level => (
            <ToolBtn
              key={level}
              onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
              active={editor.isActive("heading", { level })}
              title={`Heading ${level}`}
            >
              <span className="text-[14px] font-bold">H{level}</span>
            </ToolBtn>
          ))}
        </Group>

        <Sep />

        {/* Lists & blocks */}
        <Group>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            active={editor.isActive("bulletList")}
            title="Bullet list"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
              <circle cx="2.5" cy="4" r="1.25" fill="currentColor" stroke="none" />
              <circle cx="2.5" cy="8" r="1.25" fill="currentColor" stroke="none" />
              <circle cx="2.5" cy="12" r="1.25" fill="currentColor" stroke="none" />
              <line x1="5.5" y1="4" x2="14" y2="4" strokeLinecap="round" />
              <line x1="5.5" y1="8" x2="14" y2="8" strokeLinecap="round" />
              <line x1="5.5" y1="12" x2="14" y2="12" strokeLinecap="round" />
            </svg>
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            active={editor.isActive("orderedList")}
            title="Numbered list"
          >
            <span className="font-mono text-[13px] font-bold">1.</span>
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            active={editor.isActive("blockquote")}
            title="Blockquote"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M3.5 8.5h2.5c.3-2 1.2-3 2.5-3.5L7.5 3C5.2 3.5 3.5 5.5 3.5 8.5v4h4v-4h-4zm6.5 0h2.5c.3-2 1.2-3 2.5-3.5L14 3c-2.3.5-4 2.5-4 5.5v4h4v-4h-4z" />
            </svg>
          </ToolBtn>
        </Group>

        <Sep />

        {/* Links */}
        <Group>
          <ToolBtn onClick={insertLink} active={editor.isActive("link")} title="Insert / edit link">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 9.5a3.5 3.5 0 0 1 4.95 0m.35-4.24-1.41 1.41M4.6 11.4l-1.41 1.41M7 7l2-2a3.54 3.54 0 1 1 5 5l-2 2" />
            </svg>
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().unsetLink().run()}
            active={false}
            title="Remove link"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 2l12 12M6.5 9.5a3.5 3.5 0 0 1 4.95 0M7 7l2-2a3.54 3.54 0 1 1 5 5l-2 2" />
            </svg>
          </ToolBtn>
        </Group>

        <Sep />

        {/* Media */}
        <Group>
          {/* Image from local file */}
          <ToolBtn onClick={() => fileInputRef.current?.click()} active={false} title="Upload image from device">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.8}>
              <rect x="1.5" y="3" width="13" height="10" rx="1.5" strokeLinecap="round" />
              <circle cx="5.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M1.5 11.5 5 8l2.5 2.5 2-2 3 3" />
            </svg>
            <span className="text-[13px]">Image</span>
          </ToolBtn>
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          {/* YouTube embed */}
          <ToolBtn onClick={insertYoutube} active={false} title="Embed YouTube video">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M15.3 4.8a2 2 0 0 0-1.4-1.4C12.7 3 8 3 8 3s-4.7 0-5.9.4A2 2 0 0 0 .7 4.8C.3 6 .3 8 .3 8s0 2 .4 3.2a2 2 0 0 0 1.4 1.4C3.3 13 8 13 8 13s4.7 0 5.9-.4a2 2 0 0 0 1.4-1.4c.4-1.2.4-3.2.4-3.2s0-2-.4-3.2zM6.5 10.5v-5l4 2.5-4 2.5z" />
            </svg>
            <span className="text-[13px]">Video</span>
          </ToolBtn>
        </Group>

        <Sep />

        {/* Table */}
        <Group>
          <ToolBtn onClick={insertTable} active={false} title="Insert 3×3 table">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.6}>
              <rect x="1.5" y="1.5" width="13" height="13" rx="1.5" />
              <line x1="1.5" y1="5.5" x2="14.5" y2="5.5" />
              <line x1="1.5" y1="10.5" x2="14.5" y2="10.5" />
              <line x1="6" y1="1.5" x2="6" y2="14.5" />
              <line x1="10.5" y1="1.5" x2="10.5" y2="14.5" />
            </svg>
            <span className="text-[13px]">Table</span>
          </ToolBtn>
          {editor.isActive("table") && (
            <ToolBtn
              onClick={() => editor.chain().focus().deleteTable().run()}
              active={false}
              title="Delete table"
              className="text-rose-500 hover:bg-rose-500/10"
            >
              <span className="text-[13px]">Del table</span>
            </ToolBtn>
          )}
        </Group>

        <Sep />

        {/* Utilities */}
        <Group>
          <ToolBtn
            onClick={() => editor.chain().focus().setParagraph().run()}
            active={false}
            title="Normal paragraph"
          >
            <span className="text-[15px]">¶</span>
          </ToolBtn>
          <ToolBtn
            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
            active={false}
            title="Clear all formatting"
          >
            <span className="text-[13px]">Clear</span>
          </ToolBtn>
        </Group>
      </div>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="sm"
        title={modalType === "link" ? "Insert Link" : "Embed YouTube Video"}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleModalSubmit()}
            >
              Confirm
            </Button>
          </div>
        }
      >
        <form onSubmit={handleModalSubmit} className="space-y-4">
          <Field
            label={modalType === "link" ? "Link URL" : "YouTube Video URL"}
            description={
              modalType === "link"
                ? "Enter the absolute URL of the link destination."
                : "Paste a YouTube video URL to embed it inline."
            }
            error={errorMsg}
          >
            <Input
              value={urlInput}
              onChange={e => {
                setUrlInput(e.target.value);
                if (e.target.value.trim()) setErrorMsg("");
              }}
              placeholder={modalType === "link" ? "https://example.com" : "https://www.youtube.com/watch?v=..."}
              autoFocus
              className="w-full"
            />
          </Field>
        </form>
      </Dialog>
    </div>
  );
}
