"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

const Icon = {
  dashboard: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>,
  folder: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  plus: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8m-4-4h8"/></svg>,
};

const navItems = [
  { icon: Icon.dashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Icon.folder, label: "Projects", href: "/projects" },
  { icon: Icon.plus, label: "New Project", href: "/projects/new" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[280px] h-screen fixed left-0 top-0 border-r border-border-subtle bg-surface-secondary/50 backdrop-blur-xl flex flex-col z-[60]">
      {/* Logo */}
      <div className="p-8">
        <Link href="/" className="flex items-center gap-3 font-bold text-xl tracking-tight">
          <span className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center text-lg shadow-[0_0_20px_rgba(99,102,241,0.3)]">
            ⚡
          </span>
          SerpCraft
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4">
        <p className="text-[9px] font-bold uppercase tracking-widest text-text-tertiary px-4 mb-2">Navigation</p>
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = item.href === "/dashboard"
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
                    ${isActive
                      ? "bg-brand-500/10 text-brand-400 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.2)]"
                      : "text-text-tertiary hover:text-text-secondary hover:bg-glass"}`}
                >
                  <span className={isActive ? "text-brand-400" : "text-text-tertiary"}>
                    {item.icon}
                  </span>
                  {item.label}
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-400 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User info */}
      <div className="p-6 border-t border-border-subtle">
        <div className="flex items-center justify-between p-3 rounded-2xl bg-glass border border-border-subtle">
          <div className="flex items-center gap-3 overflow-hidden">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-9 h-9 rounded-xl",
                  userButtonPopoverCard: "bg-surface-secondary border border-border-subtle",
                }
              }}
            />
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-semibold text-text-primary truncate">Account</span>
              <span className="text-[10px] text-text-tertiary truncate leading-none">Manage profile</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
