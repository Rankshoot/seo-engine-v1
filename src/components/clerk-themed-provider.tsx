"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "@wrksz/themes/client";
import * as React from "react";

interface ClerkThemedProviderProps {
  children: React.ReactNode;
}

export function ClerkThemedProvider({ children }: ClerkThemedProviderProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const appearance = React.useMemo(() => {
    if (isDark) {
      return {
        baseTheme: dark,
        variables: {
          colorPrimary: "#7c7eff",
          colorBackground: "#0d0e15",
          colorInputBackground: "#16171f",
          colorInputText: "#f4f4f7",
          colorText: "#f4f4f7",
          colorTextSecondary: "#7c7d8e",
          borderRadius: "0.75rem",
          fontFamily: "'Inter', sans-serif",
        },
      };
    }
    return {
      variables: {
        colorPrimary: "#7c7eff",
        colorBackground: "#ffffff",
        colorInputBackground: "#f3f4f6",
        colorInputText: "#1f2937",
        colorText: "#1f2937",
        colorTextSecondary: "#6b7280",
        borderRadius: "0.75rem",
        fontFamily: "'Inter', sans-serif",
      },
    };
  }, [isDark]);

  return <ClerkProvider appearance={appearance}>{children}</ClerkProvider>;
}
