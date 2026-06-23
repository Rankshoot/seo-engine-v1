import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s | Rankshoot Blog",
    default:  "Blog | Rankshoot",
  },
  description: "SEO insights, AI content strategies, and growth playbooks from the Rankshoot team.",
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-primary">
      <header className="border-b border-border-subtle">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="/" className="text-[15px] font-bold tracking-tight text-text-primary">
            Rankshoot
          </a>
          <nav className="flex items-center gap-6 text-[13px] text-text-secondary">
            <a href="/blog" className="hover:text-text-primary transition-colors">Blog</a>
            <a
              href="/sign-in"
              className="rounded-full px-4 py-1.5 text-[12px] font-medium bg-text-primary text-surface-primary hover:opacity-90 transition-opacity"
            >
              Sign in
            </a>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-border-subtle mt-24">
        <div className="max-w-5xl mx-auto px-6 py-8 flex items-center justify-between text-[12px] text-text-tertiary">
          <span>© {new Date().getFullYear()} Rankshoot. All rights reserved.</span>
          <a href="/" className="hover:text-text-secondary transition-colors">rankshoot.com</a>
        </div>
      </footer>
    </div>
  );
}
