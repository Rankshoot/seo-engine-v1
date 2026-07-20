"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Bell, Monitor } from "lucide-react";
import { Switch } from "@/components/ui/Switch";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setNotificationPref } from "@/lib/redux/notifications-slice";
import { enablePush, disablePush } from "@/lib/web-push-client";
import { osNotificationPermission, showOsNotification } from "@/lib/web-notify";

function SettingRow({
  icon,
  title,
  description,
  control,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-text-secondary">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-text-primary">{title}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-text-tertiary">{description}</p>
        </div>
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

/**
 * Notification preferences — two independent toggles:
 *   • In-app notifications (bell + toasts)
 *   • Desktop push (OS notifications, delivered even when the app is closed)
 * The push toggle drives the actual browser subscription + server record.
 */
export function NotificationSettingsSection() {
  const dispatch = useAppDispatch();
  const prefs = useAppSelector((s) => s.notifications.prefs);
  const inApp = prefs?.inApp ?? true;
  const push = prefs?.push ?? false;

  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);

  // Reconcile the stored pref with the browser's actual notification PERMISSION
  // on mount (not the push subscription — foreground notifications work without
  // one). If the pref says "on" but permission was revoked, turn it back off.
  useEffect(() => {
    const perm = osNotificationPermission();
    setSupported(perm !== "unsupported");
    if (push && perm !== "granted") {
      dispatch(setNotificationPref({ key: "push", value: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePushToggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      if (next) {
        const res = await enablePush();
        if (res.ok) {
          dispatch(setNotificationPref({ key: "push", value: true }));
          // Fire a confirmation notification so the user immediately sees it
          // working (and can tell if macOS is silencing the browser).
          showOsNotification("Notifications on", {
            body: "You'll be notified here when your content is ready.",
            tag: "rankshoot-test",
          });
          toast.success(
            res.closedTab
              ? "Desktop notifications enabled"
              : "Desktop notifications on. This browser only delivers them while Rankshoot is open (Brave blocks background push by default).",
          );
        } else {
          dispatch(setNotificationPref({ key: "push", value: false }));
          toast.error(res.error ?? "Could not enable desktop notifications");
        }
      } else {
        await disablePush();
        dispatch(setNotificationPref({ key: "push", value: false }));
        toast.success("Desktop notifications turned off");
      }
    } catch (e) {
      dispatch(setNotificationPref({ key: "push", value: false }));
      toast.error(e instanceof Error ? e.message : "Could not update desktop notifications");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <h2 className="text-[15px] font-semibold text-text-primary">Notifications</h2>
      <div className="divide-y divide-border-subtle/60 overflow-hidden rounded-card border border-border-subtle bg-surface-elevated">
        <SettingRow
          icon={<Bell className="h-4 w-4" />}
          title="In-app notifications"
          description="Show the notification bell and toasts inside Rankshoot when content is queued or ready."
          control={
            <Switch
              checked={inApp}
              onCheckedChange={(v) => dispatch(setNotificationPref({ key: "inApp", value: v }))}
              aria-label="In-app notifications"
            />
          }
        />
        <SettingRow
          icon={<Monitor className="h-4 w-4" />}
          title="Desktop notifications"
          description={
            supported
              ? "Get an OS notification when a blog finishes generating — even if this tab or the browser is closed."
              : "This browser doesn't support desktop push notifications."
          }
          control={
            <Switch
              checked={push}
              onCheckedChange={handlePushToggle}
              disabled={!supported || busy}
              aria-label="Desktop notifications"
            />
          }
        />
      </div>
    </section>
  );
}
