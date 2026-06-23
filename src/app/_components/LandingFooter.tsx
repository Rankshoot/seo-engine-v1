import { Logo } from "@/components/brand/Logo";
import { BRAND } from "@/constants/brand";

export function LandingFooter() {
  return (
    <footer className="border-t border-border-subtle px-4 py-16 sm:px-6">
      <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div className="max-w-[320px]">
          <Logo size="md" />
          <p className="mt-4 text-[13px] leading-relaxed text-text-tertiary">{BRAND.description}</p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-brand-violet/20 bg-brand-violet/8 px-3 py-1.5 text-[11.5px] font-medium text-brand-violet">
            <span className="ai-orb" /> AI Overviews optimized
          </div>
        </div>
        {[
          {
            heading: "Product",
            links: [
              { label: "Features", href: "#features" },
              { label: "Workflow", href: "#workflow" },
              { label: "AI Copilot", href: "#assistant" },
              { label: "Pricing", href: "#pricing" },
              { label: "Live demo", href: "#preview" },
            ],
          },
          {
            heading: "Resources",
            links: [
              { label: "Blog", href: "/blog" },
              { label: "Changelog", href: "/changelog" },
              { label: "Documentation", href: "/docs" },
              { label: "API reference", href: "/api-docs" },
              { label: "Status", href: "/status" },
            ],
          },
          {
            heading: "Company",
            links: [
              { label: "About", href: "/about" },
              { label: "Privacy policy", href: "/privacy" },
              { label: "Terms of service", href: "/terms" },
              { label: "Contact", href: "/contact" },
              { label: "FAQ", href: "#faq" },
            ],
          },
        ].map(col => (
          <div key={col.heading}>
            <h4 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-text-secondary">{col.heading}</h4>
            <ul className="mt-4 space-y-2.5">
              {col.links.map(link => (
                <li key={link.label}>
                  <a href={link.href} className="text-[13px] text-text-tertiary transition-colors hover:text-text-primary">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-12 flex max-w-[1240px] flex-col items-center justify-between gap-3 border-t border-border-subtle pt-6 text-[12px] text-text-tertiary sm:flex-row">
        <span>© {new Date().getFullYear()} {BRAND.name}. Built for the AI Overviews era.</span>
        <span className="flex items-center gap-5">
          <a href="/privacy" className="hover:text-text-primary transition-colors">Privacy</a>
          <a href="/terms" className="hover:text-text-primary transition-colors">Terms</a>
        </span>
      </div>
    </footer>
  );
}
