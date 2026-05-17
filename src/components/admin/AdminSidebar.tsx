"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";
import type { PlatformAdminRole } from "@/constants/enums/platform-admin-role";
import { platformAdminMeetsMinRole } from "@/constants/enums/platform-admin-role";
import { cn } from "@/lib/cn";

const navItems: {
  label: string;
  href: string;
  minRole: PlatformAdminRole;
  match: (path: string) => boolean;
}[] = [
  {
    label: "Overview",
    href: "/admin",
    minRole: "support",
    match: (p) => p === "/admin",
  },
  {
    label: "Users",
    href: "/admin/users",
    minRole: "support",
    match: (p) => p.startsWith("/admin/users"),
  },
  {
    label: "Projects",
    href: "/admin/projects",
    minRole: "support",
    match: (p) => p.startsWith("/admin/projects"),
  },
  {
    label: "API Usage",
    href: "/admin/api-usage",
    minRole: "support",
    match: (p) => p.startsWith("/admin/api-usage"),
  },
  {
    label: "Content",
    href: "/admin/content",
    minRole: "support",
    match: (p) => p.startsWith("/admin/content"),
  },
  {
    label: "AI Logs",
    href: "/admin/ai-logs",
    minRole: "support",
    match: (p) => p.startsWith("/admin/ai-logs"),
  },
  {
    label: "Errors",
    href: "/admin/errors",
    minRole: "admin",
    match: (p) => p.startsWith("/admin/errors"),
  },
  {
    label: "Audit Logs",
    href: "/admin/audit-logs",
    minRole: "admin",
    match: (p) => p.startsWith("/admin/audit-logs"),
  },
  {
    label: "Settings",
    href: "/admin/settings",
    minRole: "admin",
    match: (p) => p.startsWith("/admin/settings"),
  },
];

export function AdminSidebar({ role }: { role: PlatformAdminRole }) {
  const pathname = usePathname();

  const visibleItems = navItems.filter((item) =>
    platformAdminMeetsMinRole(role, item.minRole)
  );

  return (
    <aside className="w-[280px] h-screen fixed left-0 top-0 border-r border-border-subtle bg-surface-secondary flex flex-col z-[60]">
      <div className="p-8">
        <Link
          href="/admin"
          className="flex items-center gap-3 font-medium text-[20px] tracking-tight font-display text-text-primary"
        >
          <span className="w-8 h-8 rounded-[8px] bg-brand-primary flex items-center justify-center text-[14px] text-brand-on-primary">
            ⚡
          </span>
          SerpCraft
        </Link>
        <p className="text-[11px] uppercase tracking-widest text-text-tertiary mt-2 pl-11">
          Admin
        </p>
      </div>

      <nav className="flex-1 px-4 overflow-y-auto">
        <p className="text-[12px] font-bold uppercase tracking-widest text-text-tertiary px-4 mb-4">
          Navigation
        </p>
        <ul className="space-y-1.5">
          {visibleItems.map((item) => {
            const isActive = item.match(pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-[8px] text-[14px] font-medium transition-colors border",
                    isActive
                      ? "bg-surface-elevated text-brand-action border-border-subtle shadow-sm"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-hover border-transparent"
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-6 px-4">
          <Link
            href="/projects"
            className="text-[13px] text-text-tertiary hover:text-brand-action transition-colors"
          >
            ← Back to app
          </Link>
        </div>
      </nav>

      <div className="p-6 border-t border-border-subtle">
        <div className="flex items-center justify-between p-4 rounded-[12px] bg-surface-elevated border border-border-subtle shadow-sm">
          <div className="flex items-center gap-3 overflow-hidden">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-10 h-10 rounded-[8px]",
                  userButtonPopoverCard:
                    "bg-surface-secondary border border-border-subtle",
                },
              }}
            />
            <div className="flex flex-col overflow-hidden">
              <span className="text-[14px] font-medium text-text-primary truncate capitalize">
                {role}
              </span>
              <span className="text-[12px] text-text-tertiary truncate leading-none mt-0.5">
                Platform admin
              </span>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
