"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type PreviewMode = "preview" | "edit" | "raw";

export interface PreviewShellProps {
  /** Top-of-page breadcrumb / title strip. Hidden while `immersiveFullscreen` is active. */
  header: ReactNode;
  /** Toolbar slot (left side — view-mode toggle, etc). */
  toolbarLeft?: ReactNode;
  /** Toolbar slot (right side — primary action, copy, save, …). */
  toolbarRight?: ReactNode;
  /** Right rail rendered next to the main content. Pass `null` to hide. */
  sidebar: ReactNode | null;
  /** Main content (preview / edit / raw view). */
  children: ReactNode;
  /** Show/hide the right rail. Defaults to true. */
  showSidebar?: boolean;
  /** Width of the right rail in px. */
  sidebarWidthPx?: number;
  /** Background colour for the canvas area (overrides default). */
  canvasBg?: string;
  /** Whether the inner canvas has its own border + radius. Defaults to true. */
  framedCanvas?: boolean;
  className?: string;
  /**
   * Renders the toolbar row inside the left canvas column (sticky top, border-b),
   * like the blog viewer — avoids “floating” controls above an unframed preview.
   */
  toolbarInsideCanvas?: boolean;
  /**
   * Fullscreen is a fixed overlay with **only** the main canvas (no page header,
   * no sidebar). Toolbars move into a slim top bar that auto-hides and reappears
   * when the pointer nears the top edge (e-reader / PDF style).
   */
  immersiveFullscreen?: boolean;
}

/**
 * Reusable shell for the Content Studio previewers.
 *
 *   ┌─ header ─────────────────────────────────────────────┐
 *   ├─ toolbar ────────────────────────────────────────────┤
 *   │ ┌─ canvas (children)──┐  ┌─ sidebar ──────────────┐  │
 *   │ │                     │  │                        │  │
 *   │ └─────────────────────┘  └────────────────────────┘  │
 *   └──────────────────────────────────────────────────────┘
 *
 * Wraps the canvas in a fixed-position fullscreen layer when toggled, so the
 * Edit, Save, and Copy actions still function inside fullscreen — that
 * behaviour was specifically requested by product.
 */
export function PreviewShell({
  header,
  toolbarLeft,
  toolbarRight,
  sidebar,
  children,
  showSidebar = true,
  sidebarWidthPx = 320,
  canvasBg,
  framedCanvas = true,
  className,
  toolbarInsideCanvas = false,
  immersiveFullscreen = false,
}: PreviewShellProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [immersiveBarVisible, setImmersiveBarVisible] = useState(false);
  const hideImmersiveBarTimerRef = useRef<number | null>(null);

  const exitFullscreen = useCallback(() => setFullscreen(false), []);

  const clearImmersiveBarTimer = useCallback(() => {
    if (hideImmersiveBarTimerRef.current) {
      clearTimeout(hideImmersiveBarTimerRef.current);
      hideImmersiveBarTimerRef.current = null;
    }
  }, []);

  const scheduleHideImmersiveBar = useCallback(() => {
    clearImmersiveBarTimer();
    hideImmersiveBarTimerRef.current = window.setTimeout(() => setImmersiveBarVisible(false), 2200);
  }, [clearImmersiveBarTimer]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFullscreen();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen, exitFullscreen]);

  useEffect(() => {
    if (!fullscreen || !immersiveFullscreen) {
      clearImmersiveBarTimer();
      return;
    }
    const showTimer = window.setTimeout(() => setImmersiveBarVisible(true), 0);
    const hideTimer = window.setTimeout(() => setImmersiveBarVisible(false), 2600);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [fullscreen, immersiveFullscreen, clearImmersiveBarTimer]);

  const fullscreenToggle = (
    <FullscreenToggle fullscreen={fullscreen} onToggle={() => setFullscreen(v => !v)} />
  );

  const showToolbarRow = Boolean(toolbarLeft || toolbarRight);

  const toolbarRow = showToolbarRow ? (
    <div className="flex shrink-0 items-center justify-between gap-3 px-2 py-2 sm:px-3 border-b border-border-subtle bg-surface-primary">
      <div className="flex items-center gap-2 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {toolbarLeft}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {toolbarRight}
        {fullscreenToggle}
      </div>
    </div>
  ) : (
    <div className="flex shrink-0 items-center justify-end gap-2 px-2 py-2 border-b border-border-subtle bg-surface-primary">
      {fullscreenToggle}
    </div>
  );

  const canvasShellClass = cn(
    "flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden",
    framedCanvas || toolbarInsideCanvas ? "rounded-[10px] border border-border-subtle" : "",
    !canvasBg && (framedCanvas || toolbarInsideCanvas) ? "bg-surface-primary" : "",
  );

  const canvasScroll = (
    <div className="flex-1 min-h-0 overflow-y-auto" style={canvasBg && !toolbarInsideCanvas ? { background: canvasBg } : undefined}>
      {children}
    </div>
  );

  const leftColumn = toolbarInsideCanvas ? (
    <div className={canvasShellClass} style={canvasBg ? { background: canvasBg } : undefined}>
      {toolbarRow}
      {canvasScroll}
    </div>
  ) : (
    <div
      className={cn(
        "flex-1 min-w-0 overflow-y-auto",
        framedCanvas ? "rounded-[10px] border border-border-subtle" : "",
        !canvasBg && framedCanvas ? "bg-surface-primary" : "",
      )}
      style={canvasBg ? { background: canvasBg } : undefined}
    >
      {children}
    </div>
  );

  const mainRow = (
    <div className="flex flex-1 min-h-0 gap-5">
      {leftColumn}
      {showSidebar && sidebar !== null && !(fullscreen && immersiveFullscreen) ? (
        <aside
          className="shrink-0 rounded-[10px] border border-border-subtle bg-surface-secondary overflow-hidden"
          style={{ width: `${sidebarWidthPx}px` }}
        >
          <div className="h-full overflow-y-auto blog-sidebar-scroll">{sidebar}</div>
        </aside>
      ) : null}
    </div>
  );

  const layout = (
    <>
      {header}

      {!toolbarInsideCanvas && showToolbarRow ? (
        <div className="flex shrink-0 items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2 min-w-0">{toolbarLeft}</div>
          <div className="flex items-center gap-2 shrink-0">
            {toolbarRight}
            {fullscreenToggle}
          </div>
        </div>
      ) : null}

      {!toolbarInsideCanvas && !showToolbarRow ? (
        <div className="flex shrink-0 justify-end px-1">{fullscreenToggle}</div>
      ) : null}

      {mainRow}
    </>
  );

  if (fullscreen && immersiveFullscreen) {
    return (
      <ImmersiveFullscreenOverlay
        className={className}
        barVisible={immersiveBarVisible}
        onReveal={() => {
          clearImmersiveBarTimer();
          setImmersiveBarVisible(true);
        }}
        onRequestHide={() => scheduleHideImmersiveBar()}
        toolbar={
          <div className="flex w-full items-center justify-between gap-3 px-3 py-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {toolbarLeft}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {toolbarRight}
              <FullscreenToggle fullscreen onToggle={exitFullscreen} />
            </div>
          </div>
        }
      >
        <div className="h-full min-h-0">{children}</div>
      </ImmersiveFullscreenOverlay>
    );
  }

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col gap-3 overflow-hidden bg-surface-primary p-4 sm:p-6">
        {layout}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col h-full overflow-hidden gap-3", className)}>
      {layout}
    </div>
  );
}

function ImmersiveFullscreenOverlay({
  children,
  toolbar,
  barVisible,
  onReveal,
  onRequestHide,
  className,
}: {
  children: ReactNode;
  toolbar: ReactNode;
  barVisible: boolean;
  onReveal: () => void;
  onRequestHide: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn("fixed inset-0 z-[100] flex flex-col overflow-hidden bg-surface-primary", className)}
      onMouseMove={e => {
        if (e.clientY < 88) onReveal();
        else onRequestHide();
      }}
    >
      <div
        className={cn(
          "absolute left-0 right-0 top-0 z-[115] border-b border-border-subtle bg-surface-secondary text-text-primary shadow-lg transition-[transform,opacity] duration-200 ease-out",
          barVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none",
        )}
      >
        {toolbar}
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden pt-0">{children}</div>
    </div>
  );
}

function FullscreenToggle({ fullscreen, onToggle }: { fullscreen: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={fullscreen ? "Exit fullscreen (Esc)" : "Enter fullscreen"}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-subtle bg-surface-elevated text-text-secondary transition-colors hover:border-border-default hover:text-text-primary"
      aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
    >
      {fullscreen ? (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
        </svg>
      ) : (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
        </svg>
      )}
    </button>
  );
}

/**
 * Pill toggle for the preview / edit / raw modes — used by every previewer.
 * Centralised here so dark/light themes and font sizing stay consistent.
 */
export function ViewModePill<T extends string>({
  modes,
  active,
  onChange,
  disabled,
}: {
  modes: { key: T; label: string }[];
  active: T;
  onChange: (next: T) => void;
  disabled?: (next: T) => boolean;
}) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-full border border-border-subtle">
      {modes.map(m => {
        const selected = active === m.key;
        const isDisabled = disabled?.(m.key);
        return (
          <button
            key={m.key}
            type="button"
            onClick={() => !isDisabled && onChange(m.key)}
            disabled={isDisabled}
            className="px-4 py-1 rounded-full text-[12px] font-medium capitalize transition-all disabled:cursor-not-allowed disabled:opacity-40"
            style={
              selected
                ? { background: "var(--text-primary)", color: "var(--surface-primary)" }
                : { background: "transparent", color: "var(--text-tertiary)" }
            }
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
