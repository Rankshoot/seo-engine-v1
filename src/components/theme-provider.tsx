import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "@wrksz/themes/next";

/**
 * Thin passthrough so the rest of the app can import ThemeProvider from a
 * single place. NOT marked "use client" because @wrksz/themes/next exports an
 * async Server Component that reads the theme cookie via next/headers — it
 * must run on the server, not wrapped in a client boundary.
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
