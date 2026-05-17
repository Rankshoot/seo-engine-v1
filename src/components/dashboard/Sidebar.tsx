"use client";

import Link from "next/link";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/brand/Logo";

const Icon = {
  folder: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  plus: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8m-4-4h8"/></svg>,
};

const navItems = [{ icon: Icon.folder, label: "Projects", href: "/projects" as const }];

export default function Sidebar({ onNewProject }: { onNewProject?: () => void }) {
  const pathname = usePathname();

  return (
    <aside className="w-[280px] h-screen fixed left-0 top-0 border-r border-border-subtle bg-surface-secondary flex flex-col z-[60]">
      {/* Logo */}
      <div className="p-8">
        <Link href="/" className="inline-flex">
          <Logo size="md" />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4">
        <p className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary px-4 mb-4">Navigation</p>
        <ul className="space-y-1.5">
          {navItems.map(item => {
            const isActive = pathname === "/projects" || pathname === "/projects/";
            return (
              <li key={item.label}>
                <ProjectNavLink
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-[8px] text-[14px] font-medium transition-colors
                    ${isActive
                      ? "bg-surface-elevated text-brand-action border border-border-subtle shadow-sm"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-transparent"}`}
                >
                  <span className={isActive ? "text-brand-action" : "text-text-tertiary"}>
                    {item.icon}
                  </span>
                  {item.label}
                </ProjectNavLink>
              </li>
            );
          })}
          <li>
            {onNewProject ? (
              <button
                type="button"
                onClick={onNewProject}
                className="flex w-full items-center gap-3 px-4 py-3 rounded-[8px] text-[14px] font-medium transition-colors text-left border border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-hover"
              >
                <span className="text-text-tertiary">{Icon.plus}</span>
                New Project
              </button>
            ) : (
              <ProjectNavLink
                href="/projects?new=1"
                className="flex items-center gap-3 px-4 py-3 rounded-[8px] text-[14px] font-medium transition-colors text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-transparent"
              >
                <span className="text-text-tertiary">{Icon.plus}</span>
                New Project
              </ProjectNavLink>
            )}
          </li>
        </ul>
      </nav>

      {/* User info */}
      <div className="p-6 border-t border-border-subtle">
        <div className="flex items-center justify-between p-4 rounded-[12px] bg-surface-elevated border border-border-subtle shadow-sm">
          <div className="flex items-center gap-3 overflow-hidden">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-10 h-10 rounded-[8px]",
                  userButtonPopoverCard: "bg-surface-secondary border border-border-subtle",
                }
              }}
            />
            <div className="flex flex-col overflow-hidden">
              <span className="text-[14px] font-medium text-text-primary truncate">Account</span>
              <span className="text-[12px] text-text-tertiary truncate leading-none mt-0.5">Manage profile</span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
