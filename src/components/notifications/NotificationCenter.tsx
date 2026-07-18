"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, CheckCheck, X, Loader2, CircleAlert, ExternalLink } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  markNotificationRead,
  markAllNotificationsRead,
  removeNotification,
  clearNotifications,
  dismissOsPrompt,
  setNotificationPref,
  type AppNotification,
} from "@/lib/redux/notifications-slice";
import { enablePush, webPushSupported } from "@/lib/web-push-client";
import { showOsNotification } from "@/lib/web-notify";
import { formatRelativeTime } from "@/utils/format";
import toast from "react-hot-toast";

function StatusDot({ status }: { status: AppNotification["status"] }) {
  if (status === "running")
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-violet" aria-hidden />;
  if (status === "success")
    return <Check className="h-3.5 w-3.5 text-status-success" aria-hidden />;
  if (status === "error")
    return <CircleAlert className="h-3.5 w-3.5 text-status-danger" aria-hidden />;
  return <span className="h-2 w-2 rounded-full bg-brand-violet" aria-hidden />;
}

/**
 * Notification center — bell + dropdown fed by the persisted `notifications`
 * slice. Shows queued/finished/failed content generations (and anything else
 * dispatched via `useNotify`), lets the user jump to the result, and offers a
 * one-click "enable OS notifications" prompt.
 */
export function NotificationCenter() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const items = useAppSelector((s) => s.notifications.items);
  const osPromptDismissed = useAppSelector((s) => s.notifications.osPromptDismissed);
  const pushEnabled = useAppSelector((s) => s.notifications.prefs?.push ?? false);

  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click. The panel is portaled to <body>, so it isn't a DOM
  // child of the button's wrapper — check both refs explicitly.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (btnRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const unread = useMemo(() => items.filter((i) => !i.read).length, [items]);

  // Position the panel with viewport-fixed coordinates measured from the bell,
  // so it escapes the narrow sidebar's clipping/stacking (was overlapping the
  // nav + project switcher). Clamp so it never runs off-screen.
  const handleOpen = useCallback(() => {
    setSupported(webPushSupported());
    const willOpen = !open;
    if (willOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const width = 320;
      const gap = 8;
      const left = Math.max(gap, Math.min(rect.left, window.innerWidth - width - gap));
      const top = Math.min(rect.bottom + gap, window.innerHeight - 120);
      setPos({ top, left });
    }
    setOpen((v) => !v);
  }, [open]);

  const handleItemClick = useCallback(
    (n: AppNotification) => {
      dispatch(markNotificationRead(n.id));
      if (n.href) {
        setOpen(false);
        router.push(n.href);
      }
    },
    [dispatch, router],
  );

  const enableOs = useCallback(async () => {
    setEnabling(true);
    try {
      const res = await enablePush();
      if (res.ok) {
        dispatch(setNotificationPref({ key: "push", value: true }));
        dispatch(dismissOsPrompt());
        showOsNotification("Notifications on", {
          body: "You'll be notified here when your content is ready.",
          tag: "rankshoot-test",
        });
        toast.success(
          res.closedTab
            ? "Desktop notifications enabled"
            : "Desktop notifications on (delivered while Rankshoot is open on this browser).",
        );
      } else {
        toast.error(res.error ?? "Could not enable desktop notifications");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not enable desktop notifications");
    } finally {
      setEnabling(false);
    }
  }, [dispatch]);

  const showOsPrompt = supported && !pushEnabled && !osPromptDismissed;

  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          style={{ top: pos.top, left: pos.left, transformOrigin: "top left" }}
          className="fixed z-[9999] w-[320px] overflow-hidden rounded-[14px] border border-border-subtle bg-surface-elevated shadow-[0_12px_40px_rgba(0,0,0,0.28)]"
            role="dialog"
            aria-label="Notifications"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
              <span className="text-[13px] font-semibold text-text-primary">Notifications</span>
              {items.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => dispatch(markAllNotificationsRead())}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary"
                    title="Mark all read"
                  >
                    <CheckCheck className="h-3.5 w-3.5" /> Read
                  </button>
                  <button
                    type="button"
                    onClick={() => dispatch(clearNotifications())}
                    className="rounded-md px-1.5 py-1 text-[11px] font-medium text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* OS permission prompt */}
            {showOsPrompt && (
              <div className="flex items-start gap-2.5 border-b border-border-subtle bg-brand-violet/[0.06] px-4 py-3">
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-brand-violet" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-text-primary">Get notified when content is ready</p>
                  <p className="mt-0.5 text-[11px] text-text-tertiary">
                    Turn on desktop notifications so you can leave this page while blogs generate.
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={enableOs}
                      disabled={enabling}
                      className="rounded-full bg-brand-violet px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-brand-action-hover disabled:opacity-60"
                    >
                      {enabling ? "Enabling…" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => dispatch(dismissOsPrompt())}
                      className="rounded-full px-2.5 py-1 text-[11px] font-medium text-text-tertiary transition-colors hover:bg-surface-hover"
                    >
                      Not now
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* List */}
            <div className="max-h-[360px] overflow-y-auto">
              {items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-secondary text-text-tertiary">
                    <Bell className="h-4 w-4" />
                  </span>
                  <p className="text-[12.5px] text-text-tertiary">No notifications yet</p>
                </div>
              ) : (
                items.map((n) => (
                  <div
                    key={n.id}
                    className={`group relative flex items-start gap-3 border-b border-border-subtle/60 px-4 py-3 transition-colors last:border-b-0 ${
                      n.href ? "cursor-pointer hover:bg-surface-hover/70" : ""
                    } ${n.read ? "" : "bg-brand-violet/[0.04]"}`}
                    onClick={n.href ? () => handleItemClick(n) : undefined}
                  >
                    <span className="mt-0.5 shrink-0">
                      <StatusDot status={n.status} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-medium text-text-primary leading-snug">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-[11.5px] text-text-tertiary leading-snug">{n.body}</p>}
                      <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-text-tertiary">
                        <span>{formatRelativeTime(n.createdAt)}</span>
                        {n.href && (
                          <span className="inline-flex items-center gap-0.5 text-brand-violet opacity-0 transition-opacity group-hover:opacity-100">
                            <ExternalLink className="h-2.5 w-2.5" /> Open
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch(removeNotification(n.id));
                      }}
                      aria-label="Dismiss notification"
                      className="shrink-0 rounded-md p-1 text-text-tertiary opacity-0 transition-all hover:bg-surface-hover hover:text-text-primary group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
  );

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={handleOpen}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        aria-expanded={open}
        className="relative flex items-center justify-center w-7 h-7 rounded-[6px] text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-all"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-violet px-1 text-[9px] font-bold leading-none text-white ring-2 ring-surface-secondary">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* Portaled to <body> so it escapes the sidebar's stacking contexts and
          renders above the project switcher and everything else. */}
      {typeof document !== "undefined" ? createPortal(panel, document.body) : null}
    </div>
  );
}
