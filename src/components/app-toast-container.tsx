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

  return (
    <Toaster
      position="top-center"
      reverseOrder={false}
      toastOptions={{
        // Define default options
        className: '',
        duration: 4000,
        style: {
          background: resolvedTheme === "dark" ? '#333' : '#fff',
          color: resolvedTheme === "dark" ? '#fff' : '#363636',
          zIndex: 100000,
        },
      }}
    />
  );
}
