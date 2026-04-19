"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Project } from "@/lib/types";

const Icon = {
  grid: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>,
  search: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  calendar: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>,
  fileText: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><line x1="10" x2="8" y1="9" y2="9"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>,
  arrowLeft: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>,
  home: <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
};

interface ProjectSidebarProps {
  project: Project;
  stats?: { approvedKeywords: number; calendarEntries: number; blogsGenerated: number };
}

export default function ProjectSidebar({ project, stats }: ProjectSidebarProps) {
  const pathname = usePathname();
  const base = `/projects/${project.id}`;

  const navItems = [
    { icon: Icon.grid, label: "Overview", href: base },
    {
      icon: Icon.search,
      label: "Keywords",
      href: `${base}/keywords`,
      badge: stats?.approvedKeywords ? `${stats.approvedKeywords} approved` : undefined,
    },
    {
      icon: Icon.calendar,
      label: "Calendar",
      href: `${base}/calendar`,
      badge: stats?.calendarEntries ? `${stats.calendarEntries} entries` : undefined,
    },
    {
      icon: Icon.fileText,
      label: "Blogs",
      href: `${base}/blogs`,
      badge: stats?.blogsGenerated ? `${stats.blogsGenerated} ready` : undefined,
    },
  ];

  const isActive = (href: string) =>
    href === base ? pathname === base : pathname.startsWith(href);

  return (
    <aside className="w-[280px] h-screen fixed left-0 top-0 border-r border-border-subtle bg-surface-secondary/50 backdrop-blur-xl flex flex-col z-[60]">
      {/* Logo */}
      <div className="p-6 pb-4">
        <Link href="/" className="flex items-center gap-3 font-bold text-xl tracking-tight mb-6">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-lg shadow-[0_0_20px_rgba(99,102,241,0.3)]">
            ⚡
          </span>
          SerpCraft
        </Link>

        {/* Project badge */}
        <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20">
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-400 mb-1">Current Project</p>
          <p className="text-sm font-bold text-text-primary truncate">{project.name}</p>
          <p className="text-[10px] text-text-tertiary truncate">{project.domain}</p>
        </div>
      </div>

      {/* Project Nav */}
      <nav className="flex-1 px-4 overflow-y-auto">
        <p className="text-[9px] font-bold uppercase tracking-widest text-text-tertiary px-4 mb-2">Project</p>
        <ul className="space-y-1 mb-6">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
                    ${active
                      ? "bg-brand-500/10 text-brand-400 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.2)]"
                      : "text-text-tertiary hover:text-text-secondary hover:bg-glass"}`}
                >
                  <span className={active ? "text-brand-400" : "text-text-tertiary"}>{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="text-[9px] font-bold bg-surface-elevated px-2 py-0.5 rounded-full text-text-tertiary">
                      {item.badge}
                    </span>
                  )}
                  {active && <div className="w-1.5 h-1.5 rounded-full bg-brand-400 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-border-subtle pt-4">
          <p className="text-[9px] font-bold uppercase tracking-widest text-text-tertiary px-4 mb-2">Navigate</p>
          <ul className="space-y-1">
            <li>
              <Link href="/projects" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-text-tertiary hover:text-text-secondary hover:bg-glass transition-all">
                {Icon.arrowLeft}
                All Projects
              </Link>
            </li>
            <li>
              <Link href="/dashboard" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-text-tertiary hover:text-text-secondary hover:bg-glass transition-all">
                {Icon.home}
                Dashboard
              </Link>
            </li>
          </ul>
        </div>
      </nav>

      {/* User */}
      <div className="p-6 border-t border-border-subtle">
        <div className="flex items-center justify-between p-3 rounded-2xl bg-glass border border-border-subtle">
          <div className="flex items-center gap-3 overflow-hidden">
            <UserButton appearance={{ elements: { avatarBox: "w-9 h-9 rounded-xl" } }} />
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
