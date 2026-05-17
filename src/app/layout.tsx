import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";
import { ReduxProvider } from "@/components/redux-provider";
import { AppToastContainer } from "@/components/app-toast-container";

// Conditionally import Clerk only if keys are configured
const isClerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export const metadata: Metadata = {
  title: "RANKIT — AI SEO Operating System",
  description:
    "Automate your entire SEO workflow with AI. Discover keywords, analyze competitors, generate content, and publish automatically. Enterprise-grade AI that thinks like your best SEO.",
  keywords:
    "AI SEO, SEO automation, keyword research, competitor analysis, AI content generation, SEO operating system, content marketing AI",
  openGraph: {
    title: "RANKIT — AI SEO Operating System",
    description:
      "The all-in-one AI platform that automates keyword discovery, competitor analysis, content generation, and publishing. Transform your SEO strategy.",
    type: "website",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const content = (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased bg-surface-primary text-text-primary dark">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ReduxProvider>
            <QueryProvider>
              <AppToastContainer />
              {children}
            </QueryProvider>
          </ReduxProvider>
        </ThemeProvider>
      </body>
    </html>
  );

  if (isClerkConfigured) {
    // Dynamically import Clerk to avoid errors when keys aren't set
    const { ClerkProvider } = await import("@clerk/nextjs");
    const { dark } = await import("@clerk/themes");

    return (
      <ClerkProvider
        appearance={{
          baseTheme: dark,
          variables: {
            colorPrimary: "#6366f1",
            colorBackground: "#111118",
            colorInputBackground: "#1a1a24",
            colorInputText: "#f0f0f5",
            colorText: "#f0f0f5",
            colorTextSecondary: "#a0a0b8",
            borderRadius: "0.75rem",
            fontFamily: "'Inter', sans-serif",
          },
        }}
      >
        {content}
      </ClerkProvider>
    );
  }

  // Fallback when Clerk isn't configured — app still works for landing page
  return content;
}
