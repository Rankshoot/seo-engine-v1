import { forwardRef, useImperativeHandle, useRef, type RefObject } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { Image } from "@tiptap/extension-image";
import { Youtube } from "@tiptap/extension-youtube";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import { Link } from "@tiptap/extension-link";
import { Markdown } from "tiptap-markdown";
import { TipTapFormatToolbar } from "./TipTapFormatToolbar";
import { cn } from "@/lib/cn";

export interface TipTapBlogEditorRef {
  getMarkdown: () => string;
  setHighlightCurrentSelection: () => void;
  clearHighlight: () => void;
  /**
   * Replace the current ProseMirror selection with `markdown` content.
   * Returns true if the replacement was applied, false if no selection exists.
   */
  replaceSelection: (markdown: string) => boolean;
  /**
   * Update the attributes (src and optional alt) of the image node
   * at the exact ProseMirror position of a target HTMLImageElement.
   */
  updateImageAtDom?: (img: HTMLImageElement, newSrc: string, newAlt?: string) => boolean;
  /**
   * Delete the image node corresponding to a target HTMLImageElement from the editor document.
   */
  deleteImageAtDom?: (img: HTMLImageElement) => boolean;
}

export interface TipTapBlogEditorProps {
  initialMarkdown: string;
  /** DOM container ref — used by BlogImageEditOverlay for click detection. */
  containerRef?: RefObject<HTMLDivElement | null>;
  onChange?: (markdown: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

/* ── YouTube URL utilities ──────────────────────────────────────────── */

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtube-nocookie.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/\/embed\/([^/?#]+)/);
      if (m) return m[1];
      const shorts = u.pathname.match(/\/shorts\/([^/?#]+)/);
      if (shorts) return shorts[1];
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id || null;
    }
  } catch {
    // not a valid URL
  }
  return null;
}

/**
 * Convert ```youtube\nURL\n``` fenced blocks → <div data-youtube-video> HTML
 * so TipTap's YouTube extension parseHTML rules can restore the youtube node.
 */
function preprocessMarkdown(md: string): string {
  return md.replace(/```youtube\r?\n([\s\S]*?)\r?\n```/g, (match, rawUrl: string) => {
    const url = rawUrl.trim();
    const videoId = extractYouTubeId(url);
    if (!videoId) return match;
    const embedSrc = `https://www.youtube-nocookie.com/embed/${videoId}`;
    return `<div data-youtube-video><iframe src="${embedSrc}" width="100%" height="400" allowfullscreen></iframe></div>`;
  });
}

/**
 * Convert tiptap-markdown HTML YouTube output → ```youtube\nURL\n``` fenced block.
 * tiptap-markdown may fall back to HTML serialization for the youtube node when
 * no built-in markdown spec is registered; this ensures the saved markdown is
 * always in the fenced-block format that LongFormMarkdown can embed.
 */
function postprocessMarkdown(md: string): string {
  return md.replace(
    /<div[^>]*data-youtube-video[^>]*>[\s\S]*?<iframe[^>]*\bsrc="([^"]*)"[\s\S]*?<\/iframe>[\s\S]*?<\/div>/gi,
    (_, src: string) => {
      const idMatch = src.match(/\/embed\/([^?&#/]+)/);
      const videoId = idMatch?.[1] ?? null;
      const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : src;
      return "```youtube\n" + url + "\n```";
    },
  );
}

/* ── Image extension with tiptap-markdown serialization spec ─────────── */
const ImageWithMarkdown = Image.extend({
  addStorage() {
    return {
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        serialize(state: any, node: any) {
          const alt = (node.attrs.alt ?? "") as string;
          const src = (node.attrs.src ?? "") as string;
          state.write(`![${alt}](${src})`);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

const HighlightPluginKey = new PluginKey("selection-highlight");

interface SelectionHighlightOptions {
  getHighlightRange: () => { from: number; to: number } | null;
}

const SelectionHighlightExtension = Extension.create<SelectionHighlightOptions>({
  name: "selectionHighlight",

  addOptions() {
    return {
      getHighlightRange: () => null,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin({
        key: HighlightPluginKey,
        props: {
          decorations(state) {
            const range = options.getHighlightRange();
            if (!range || range.from === range.to) {
              return DecorationSet.empty;
            }
            const dec = Decoration.inline(range.from, range.to, {
              class: "ai-rewrite-highlight",
              style: "background-color: rgba(234, 179, 8, 0.25); border-bottom: 1px solid var(--brand-action); transition: background-color 0.2s;",
            });
            return DecorationSet.create(state.doc, [dec]);
          },
        },
      }),
    ];
  },
});

/* ── YouTube extension with tiptap-markdown serialization spec ───────── */
const YoutubeWithMarkdown = Youtube.extend({
  addStorage() {
    return {
      markdown: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        serialize(state: any, node: any) {
          const src = (node.attrs.src ?? "") as string;
          const videoId = extractYouTubeId(src) ?? "";
          const url = videoId ? `https://www.youtube.com/watch?v=${videoId}` : src;
          state.write("```youtube\n" + url + "\n```");
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
});

/* ── Editor component ───────────────────────────────────────────────── */
export const TipTapBlogEditor = forwardRef<
  TipTapBlogEditorRef,
  TipTapBlogEditorProps
>(({ initialMarkdown, containerRef, onChange, className, style }, ref) => {
  const highlightRangeRef = useRef<{ from: number; to: number } | null>(null);
  const isApplyingEditRef = useRef<boolean>(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Disable code blocks in starter-kit so tiptap-markdown handles fenced blocks correctly
        codeBlock: false,
      }),
      ImageWithMarkdown.configure({ inline: false, allowBase64: true }),
      YoutubeWithMarkdown.configure({ width: 640, height: 400, nocookie: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
      Link.configure({ openOnClick: false, autolink: true }),
      Markdown.configure({ html: true, tightLists: true, bulletListMarker: "-" }),
      SelectionHighlightExtension.configure({
        getHighlightRange: () => highlightRangeRef.current,
      }),
    ],
    // Pre-process to restore youtube fenced blocks as proper TipTap youtube nodes
    content: preprocessMarkdown(initialMarkdown),
    onUpdate({ editor }) {
      if (onChange) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = (editor.storage as any).markdown?.getMarkdown?.() ?? "";
        onChange(postprocessMarkdown(raw).replace(/\n{3,}/g, "\n\n").trim());
      }
    },
    onSelectionUpdate({ editor }) {
      if (isApplyingEditRef.current) return;
      if (!editor.isFocused) return;
      const { from, to } = editor.state.selection;
      const hr = highlightRangeRef.current;
      if (hr) {
        if (from < hr.from || to > hr.to) {
          highlightRangeRef.current = null;
          editor.view.dispatch(editor.state.tr);
        }
      }
    },
    editorProps: {
      attributes: {
        class: "tiptap-blog-content visual-blog-editor",
        spellcheck: "true",
      },
    },
  });

  useImperativeHandle(ref, () => ({
    getMarkdown: () => {
      if (!editor) return "";
      // Get markdown from tiptap-markdown, then post-process any HTML YouTube
      // fallbacks into fenced ```youtube blocks so the preview can embed them.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = (editor.storage as any).markdown?.getMarkdown?.() ?? "";
      return postprocessMarkdown(raw).replace(/\n{3,}/g, "\n\n").trim();
    },
    setHighlightCurrentSelection: () => {
      if (!editor) return;
      const { from, to } = editor.state.selection;
      if (from !== to) {
        highlightRangeRef.current = { from, to };
        editor.view.dispatch(editor.state.tr);
      }
    },
    clearHighlight: () => {
      highlightRangeRef.current = null;
      if (editor) {
        editor.view.dispatch(editor.state.tr);
      }
    },
    replaceSelection: (markdown: string) => {
      if (!editor) return false;
      const { from, to } = editor.state.selection;
      if (from === to) return false; // no selection
      // preprocessMarkdown handles ```youtube``` fenced blocks → div[data-youtube-video]
      const processed = preprocessMarkdown(markdown);

      isApplyingEditRef.current = true;
      try {
        editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, processed, {
          parseOptions: { preserveWhitespace: "full" },
        }).run();
      } finally {
        isApplyingEditRef.current = false;
      }

      const newTo = editor.state.selection.from;
      highlightRangeRef.current = { from, to: newTo };
      editor.view.dispatch(editor.state.tr);

      return true;
    },
    updateImageAtDom: (img: HTMLImageElement, newSrc: string, newAlt?: string) => {
      if (!editor) return false;
      try {
        const pos = editor.view.posAtDOM(img, 0);
        const node = editor.state.doc.nodeAt(pos);
        if (node && node.type.name === "image") {
          const attrs = { ...(node.attrs as any), src: newSrc };
          if (newAlt !== undefined) {
            attrs.alt = newAlt;
          }
          const transaction = editor.state.tr.setNodeMarkup(pos, undefined, attrs);
          editor.view.dispatch(transaction);
          return true;
        }
      } catch (e) {
        console.error("Failed to update image at DOM position", e);
      }
      return false;
    },
    deleteImageAtDom: (img: HTMLImageElement) => {
      if (!editor) return false;
      try {
        const pos = editor.view.posAtDOM(img, 0);
        const node = editor.state.doc.nodeAt(pos);
        if (node && node.type.name === "image") {
          const transaction = editor.state.tr.delete(pos, pos + node.nodeSize);
          editor.view.dispatch(transaction);
          return true;
        }
      } catch (e) {
        console.error("Failed to delete image at DOM position", e);
      }
      return false;
    },
  }));

  return (
    <div className={cn("tiptap-editor", className)} style={style}>
      {/* Formatting toolbar — sticky below the page's main toolbar (top-[51px]) */}
      <div className="sticky top-[51px] z-[9] -mx-4 md:-mx-8 lg:-mx-16 xl:-mx-20">
        <TipTapFormatToolbar editor={editor ?? null} />
      </div>
      <div ref={containerRef}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});
TipTapBlogEditor.displayName = "TipTapBlogEditor";
