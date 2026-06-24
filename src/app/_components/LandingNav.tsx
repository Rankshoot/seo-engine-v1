"use client";

import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  AuthSignedIn as SignedIn,
  AuthSignedOut as SignedOut,
  AuthUserButton as UserButton,
} from "@/components/auth-wrapper";
import { navItems } from "./landing-data";

export function BackgroundFx() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.55] dark:opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.08) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at top, black 25%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(ellipse at top, black 25%, transparent 75%)",
        }}
      />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[640px] w-[1100px] rounded-full bg-brand-violet/25 dark:bg-brand-violet/12 blur-[140px] animate-pulse-glow" />
      <div className="absolute top-[40%] left-[8%] h-[420px] w-[420px] rounded-full bg-brand-aqua/18 dark:bg-brand-aqua/8 blur-[120px] animate-pulse-glow delay-300" />
      <div className="absolute bottom-[-160px] right-[6%] h-[480px] w-[480px] rounded-full bg-brand-violet-soft/18 dark:bg-brand-violet-soft/10 blur-[140px] animate-pulse-glow delay-500" />
    </div>
  );
}

export function LandingNav({
  scrolled,
  mobileMenu,
  setMobileMenu,
}: {
  scrolled: boolean;
  mobileMenu: boolean;
  setMobileMenu: (v: boolean) => void;
}) {
  return (
    <nav className="fixed inset-x-0 top-0 z-50">
      <div
        className={`mx-auto flex items-center backdrop-blur-md justify-between transition-all duration-500 ease-out ${
          scrolled
            ? "mt-3 max-w-[1100px] rounded-full bg-glass border border-border-subtle px-5 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
            : "max-w-[1240px] border-none px-6 py-4"
        }`}
      >
        <Link href="/" className="shrink-0 group">
          <span className="inline-block transition-all duration-300 group-hover:scale-[1.04]" style={{ transformOrigin: "left center" }}>
            <Logo size="md" priority />
          </span>
        </Link>

        <div className="hidden items-center gap-0.5 md:flex">
          {navItems.map(item => (
            <a
              key={item.label}
              href={item.href}
              className="group relative px-3.5 py-2 text-[13.5px] font-medium text-text-secondary transition-colors duration-150 hover:text-text-primary rounded-lg hover:bg-surface-hover"
            >
              {item.label}
              <span className="absolute bottom-1.5 left-1/2 h-[2px] w-0 -translate-x-1/2 rounded-full bg-brand-violet transition-all duration-200 group-hover:w-4" />
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <SignedOut>
            <Link href="/sign-in" className="px-3 py-2 text-[13.5px] font-medium text-text-secondary transition-colors hover:text-text-primary">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-violet px-4 py-2 text-[13.5px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-action-hover hover:shadow-[var(--shadow-glow-md)]"
            >
              Get started <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/projects"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-violet px-4 py-2 text-[13.5px] font-semibold text-white shadow-[var(--shadow-glow-sm)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-action-hover"
            >
              Dashboard <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <UserButton />
          </SignedIn>
        </div>

        <button
          type="button"
          onClick={() => setMobileMenu(!mobileMenu)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover md:hidden"
          aria-label="Toggle menu"
        >
          {mobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div
        className="overflow-hidden transition-all duration-300 ease-out md:hidden mx-3 mt-1"
        style={{ maxHeight: mobileMenu ? "460px" : "0" }}
      >
        <div className="rounded-2xl bg-glass border border-border-subtle shadow-[var(--shadow-lg)]">
          <div className="flex flex-col gap-1 p-4">
            {navItems.map(item => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMobileMenu(false)}
                className="rounded-xl px-4 py-3 text-[14px] font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-4">
              <SignedOut>
                <Link href="/sign-in" className="py-2 text-center text-[14px] font-medium text-text-secondary">Sign in</Link>
                <Link href="/sign-up" className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-violet px-4 py-2.5 text-[14px] font-semibold text-white">
                  Get started <ArrowRight className="h-4 w-4" />
                </Link>
              </SignedOut>
              <SignedIn>
                <Link href="/projects" className="inline-flex items-center justify-center gap-1.5 rounded-full bg-brand-violet px-4 py-2.5 text-[14px] font-semibold text-white">
                  Dashboard <ArrowRight className="h-4 w-4" />
                </Link>
              </SignedIn>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
