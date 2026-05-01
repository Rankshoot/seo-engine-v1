import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";
import { ReduxProvider } from "@/components/redux-provider";

// Conditionally import Clerk only if keys are configured
const isClerkConfigured = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export const metadata: Metadata = {
  title: "SerpCraft — AI-Powered SEO Automation Platform",
  description:
    "Discover trending keywords, analyze competitors, find content gaps, and generate SEO-optimized blog content with AI. Your complete SEO automation engine.",
  keywords:
    "SEO automation, AI content generation, keyword research, competitor analysis, content calendar, SEO tools, SERP analysis",
  openGraph: {
    title: "SerpCraft — AI-Powered SEO Automation",
    description:
      "The all-in-one AI engine that finds trending keywords, analyzes competitor content gaps, generates SEO-optimized blogs, and plans your content calendar.",
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
      <body className="min-h-screen antialiased bg-surface-primary text-text-primary">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ReduxProvider>
            <QueryProvider>{children}</QueryProvider>
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
