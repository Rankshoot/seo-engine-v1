"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";

/**
 * Single global toast host — use `import { toast } from "react-hot-toast"` in pages.
 * Theme follows `next-themes` so light/dark matches the app chrome.
 */
export function AppToastContainer() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const isDark = resolvedTheme === "dark";

  return (
    <Toaster
      position="top-center"
      reverseOrder={false}
      gutter={8}
      toastOptions={{
        duration: 4000,
        className: "",
        style: {
          background: isDark ? "#16171f" : "#ffffff",
          color: isDark ? "#f4f4f7" : "#0d0d12",
          border: `1px solid ${isDark ? "#2a2b38" : "#ebebef"}`,
          borderRadius: 12,
          padding: "10px 14px",
          fontSize: 13,
          fontWeight: 500,
          boxShadow: isDark
            ? "0 16px 48px rgba(0, 0, 0, 0.55)"
            : "0 16px 48px rgba(0, 0, 0, 0.10)",
          zIndex: 100000,
        },
        success: {
          iconTheme: {
            primary: isDark ? "#22c55e" : "#16a34a",
            secondary: isDark ? "#16171f" : "#ffffff",
          },
        },
        error: {
          iconTheme: {
            primary: isDark ? "#ef4444" : "#dc2626",
            secondary: isDark ? "#16171f" : "#ffffff",
          },
        },
      }}
    />
  );
}
