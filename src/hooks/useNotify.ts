"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch } from "@/lib/redux/hooks";
import { pushNotification, type NotificationStatus } from "@/lib/redux/notifications-slice";
import { showOsNotification } from "@/lib/web-notify";

export interface NotifyInput {
  /** Dedupe/upgrade key — a "running" entry with the same key becomes "success". */
  key?: string;
  status: NotificationStatus;
  title: string;
  body?: string;
  href?: string;
  projectId?: string;
  /** Fire an OS notification too (only honored for success/error). Default true. */
  os?: boolean;
}

/**
 * Single entry point for surfacing an event: records it in the notification
 * center (persisted) and, for terminal states, fires an OS notification so an
 * online-but-away user is pinged. Toasts stay the caller's responsibility so we
 * never double-notify a user who is still looking at the page.
 */
export function useNotify(): (input: NotifyInput) => void {
  const dispatch = useAppDispatch();
  const router = useRouter();

  return useCallback(
    (input: NotifyInput) => {
      dispatch(
        pushNotification({
          id: `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          key: input.key,
          status: input.status,
          title: input.title,
          body: input.body,
          href: input.href,
          projectId: input.projectId,
          createdAt: new Date().toISOString(),
          read: false,
        }),
      );

      const wantsOs = input.os !== false && (input.status === "success" || input.status === "error");
      if (wantsOs) {
        showOsNotification(input.title, {
          body: input.body,
          tag: input.key,
          onClick: input.href ? () => router.push(input.href!) : undefined,
        });
      }
    },
    [dispatch, router],
  );
}
