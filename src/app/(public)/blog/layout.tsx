import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s | Rankshoot Blog",
    default:  "Blog | Rankshoot",
  },
};

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-primary flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border-subtle bg-surface-primary/80 backdrop-blur-md">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 group">
            <div className="w-6 h-6 rounded-[6px] bg-brand-action flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1L1 5.5v5L8 15l7-4.5v-5L8 1z" opacity=".9" />
              </svg>
            </div>
            <span className="text-[14px] font-bold tracking-tight text-text-primary group-hover:text-brand-action transition-colors">
              Rankshoot
            </span>
          </a>
          <nav className="flex items-center gap-5">
            <a href="/blog" className="text-[13px] text-text-secondary hover:text-text-primary transition-colors font-medium">
              Blog
            </a>
            <a
              href="/sign-in"
              className="rounded-full px-4 py-1.5 text-[12px] font-semibold bg-text-primary text-surface-primary hover:opacity-85 transition-opacity"
            >
              Sign in
            </a>
          </nav>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border-subtle mt-20">
        <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-[4px] bg-brand-action flex items-center justify-center">
              <svg className="w-3 h-3 text-white" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1L1 5.5v5L8 15l7-4.5v-5L8 1z" />
              </svg>
            </div>
            <span className="text-[13px] font-semibold text-text-primary">Rankshoot</span>
          </div>
          <p className="text-[12px] text-text-tertiary">
            © {new Date().getFullYear()} Rankshoot. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-[12px] text-text-tertiary">
            <a href="/" className="hover:text-text-secondary transition-colors">Home</a>
            <a href="/sign-up" className="hover:text-text-secondary transition-colors">Get started</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
