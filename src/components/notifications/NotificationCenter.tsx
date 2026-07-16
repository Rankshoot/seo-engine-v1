"use client";

import { useMemo, useRef, useState, useCallback } from "react";
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
  type AppNotification,
} from "@/lib/redux/notifications-slice";
import { useClickOutside } from "@/hooks/useClickOutside";
import {
  osNotificationPermission,
  requestOsNotificationPermission,
  type OsPermission,
} from "@/lib/web-notify";
import { formatRelativeTime } from "@/utils/format";

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
export function NotificationCenter({ collapsed = false }: { collapsed?: boolean }) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const items = useAppSelector((s) => s.notifications.items);
  const osPromptDismissed = useAppSelector((s) => s.notifications.osPromptDismissed);

  const [open, setOpen] = useState(false);
  const [perm, setPerm] = useState<OsPermission>("default");
  const ref = useRef<HTMLDivElement | null>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const unread = useMemo(() => items.filter((i) => !i.read).length, [items]);

  // Re-read the live browser permission each time the panel opens (avoids a
  // setState-in-effect and any SSR hydration mismatch on first render).
  const handleOpen = useCallback(() => {
    setPerm(osNotificationPermission());
    setOpen((v) => !v);
  }, []);

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
    const result = await requestOsNotificationPermission();
    setPerm(result);
    if (result !== "default") dispatch(dismissOsPrompt());
  }, [dispatch]);

  const showOsPrompt = perm === "default" && !osPromptDismissed;

  return (
    <div className="relative" ref={ref}>
      <button
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

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className={`absolute z-[120] mt-2 w-[320px] overflow-hidden rounded-[14px] border border-border-subtle bg-surface-elevated shadow-[0_12px_40px_rgba(0,0,0,0.18)] ${
              collapsed ? "left-full ml-2 top-0" : "right-0"
            }`}
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
                      className="rounded-full bg-brand-violet px-3 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-brand-action-hover"
                    >
                      Enable
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
    </div>
  );
}
