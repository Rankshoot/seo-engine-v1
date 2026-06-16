import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";
import { ReduxProvider } from "@/components/redux-provider";
import { AppToastContainer } from "@/components/app-toast-container";
import { ClerkThemedProvider } from "@/components/clerk-themed-provider";
import { TooltipProvider } from "@/components/ui/Tooltip";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

// Conditionally import Clerk only if keys are configured
const isClerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export const metadata: Metadata = {
  title: "Rankshoot — AI SEO Operating System",
  description:
    "Rankshoot is an AI-native SEO operating system. Discover keywords, audit competitors, plan your editorial calendar, and ship ranked content — automatically.",
  keywords:
    "AI SEO platform, keyword research, competitor analysis, content calendar, AI content generation, GEO, AI Overviews, SEO automation",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "Rankshoot — AI SEO Operating System",
    description:
      "Research keywords, audit competitors, plan editorial calendars, and ship ranked content — all from one AI-native workspace.",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Rankshoot — AI SEO Operating System",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rankshoot — AI SEO Operating System",
    description:
      "Research keywords, audit competitors, plan editorial calendars, and ship ranked content — all from one AI-native workspace.",
    images: ["/og-image.png"],
  },
};

function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ReduxProvider>
      <QueryProvider>
        <TooltipProvider delayDuration={250} skipDelayDuration={150}>
          <AppToastContainer />
          {children}
          <SpeedInsights />
        </TooltipProvider>
      </QueryProvider>
    </ReduxProvider>
  );
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const appContent = <AppProviders>{children}</AppProviders>;

  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Preconnect for Google Fonts (Inter) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Preconnect for Clerk auth (reduces redirect latency) */}
        <link rel="preconnect" href="https://clerk.accounts.dev" />
        <link rel="dns-prefetch" href="https://clerk.accounts.dev" />
      </head>
      <body className="min-h-screen antialiased bg-surface-primary text-text-primary">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {isClerkConfigured ? (
            <ClerkThemedProvider>{appContent}</ClerkThemedProvider>
          ) : (
            appContent
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
