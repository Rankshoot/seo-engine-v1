import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

/**
 * App notification center — source-agnostic feed of things worth surfacing to
 * the user (blog generation started / finished / failed, etc.). It is persisted
 * (see `store.ts`) so a "your blog is ready" notice survives a refresh, and it
 * is the single place both the live-generation flow and (later) the durable
 * background-job poller dispatch into — no matter which produced the event, the
 * UI is identical.
 */
export type NotificationStatus = "running" | "success" | "error" | "info";

export interface AppNotification {
  id: string;
  /** Groups related events; a "running" entry can be upgraded to "success". */
  key?: string;
  status: NotificationStatus;
  title: string;
  body?: string;
  /** Click target, e.g. the finished blog. */
  href?: string;
  projectId?: string;
  createdAt: string;
  read: boolean;
}

export interface NotificationsState {
  items: AppNotification[];
  /** Whether the user has dismissed the "enable OS notifications" prompt. */
  osPromptDismissed: boolean;
}

const initialState: NotificationsState = { items: [], osPromptDismissed: false };

const MAX_ITEMS = 50;

export const notificationsSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    pushNotification(state, action: PayloadAction<AppNotification>) {
      const n = action.payload;
      // If a keyed entry already exists, update it in place (running → success).
      if (n.key) {
        const idx = state.items.findIndex((i) => i.key === n.key);
        if (idx !== -1) {
          state.items[idx] = { ...state.items[idx], ...n, id: state.items[idx].id };
          return;
        }
      }
      state.items.unshift(n);
      if (state.items.length > MAX_ITEMS) state.items.length = MAX_ITEMS;
    },
    markNotificationRead(state, action: PayloadAction<string>) {
      const it = state.items.find((i) => i.id === action.payload);
      if (it) it.read = true;
    },
    markAllNotificationsRead(state) {
      for (const it of state.items) it.read = true;
    },
    removeNotification(state, action: PayloadAction<string>) {
      state.items = state.items.filter((i) => i.id !== action.payload);
    },
    clearNotifications(state) {
      state.items = [];
    },
    dismissOsPrompt(state) {
      state.osPromptDismissed = true;
    },
  },
});

export const {
  pushNotification,
  markNotificationRead,
  markAllNotificationsRead,
  removeNotification,
  clearNotifications,
  dismissOsPrompt,
} = notificationsSlice.actions;
