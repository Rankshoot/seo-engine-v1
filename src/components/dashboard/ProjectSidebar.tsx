"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { usePathname, useRouter } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Project } from "@/lib/types";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/brand/Logo";
import { qk } from "@/lib/query";
import { useMemo } from "react";
import { useAppDispatch, useAppSelector, selectProjectStats } from "@/lib/redux/hooks";
import { hydrateProjectStats } from "@/lib/redux/keyword-workspace-slice";
import { projectsApi } from "@/frontend/api/projects";

const Icon = {
  grid: <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>,
  search: <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>,
  calendar: <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>,
  fileText: <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><line x1="10" x2="8" y1="9" y2="9"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/></svg>,
  target: <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  audit: <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  arrowLeft: <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>,
  chevronDown: <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
  chevronRight: <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>,
  chevronLeft: <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  check: <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>,
  plus: <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8m-4-4h8"/></svg>,
  ai: <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.8 15.9 9 18.8l-.8-2.9a4.5 4.5 0 0 0-3.1-3.1L2.3 12l2.8-.8a4.5 4.5 0 0 0 3.1-3.1L9 5.3l.8 2.8a4.5 4.5 0 0 0 3.1 3.1l2.8.8-2.8.8a4.5 4.5 0 0 0-3.1 3.1Z"/><path d="M19 2v4"/><path d="M21 4h-4"/><path d="M19 18v4"/><path d="M21 20h-4"/></svg>,
  /** Document + pen — content generation */
  contentGen: (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10.4 12.6a2 2 0 1 1 3 3L8 21l-4 1 1-4Z" />
    </svg>
  ),
  /** Stacked pages — saved articles library */
  articles: (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 3H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h1" strokeOpacity={0.35} />
      <path d="M9 3h8.5L19 6.5V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M9 9h6" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  ),
};

interface ProjectSidebarProps {
  project?: Project | null;
  projectId: string;
  stats?: {
    approvedKeywords: number;
    calendarEntries: number;
    blogsGenerated: number;
    articlesInLibrary?: number;
    auditPending?: number;
  };
  allProjects: Project[];
  isCollapsed: boolean;
  setIsCollapsed: (val: boolean) => void;
}

export default function ProjectSidebar({ 
  project, 
  projectId,
  stats, 
  allProjects,
  isCollapsed,
  setIsCollapsed,
}: ProjectSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { data: statsResponse } = useQuery({
    queryKey: qk.projectStats(projectId),
    queryFn: () => projectsApi.stats(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes - stats don't change frequently
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const serverStats = useMemo(() => {
    return statsResponse?.success && statsResponse.data
      ? {
          approvedKeywords: statsResponse.data.approvedKeywords,
          calendarEntries: statsResponse.data.calendarEntries,
          blogsGenerated: statsResponse.data.blogsGenerated,
          articlesInLibrary: statsResponse.data.articlesInLibrary,
          auditPending: statsResponse.data.auditPending,
        }
      : stats;
  }, [statsResponse, stats]);
  const liveStats = useAppSelector(state => selectProjectStats(state, projectId, serverStats));
  const base = `/projects/${projectId}`;

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  /** Nav count badges use React Query + Redux; sidebar is client-only so counts can render immediately. */
  const navCountsReady = mounted;

  useEffect(() => {
    let active = true;
    requestAnimationFrame(() => {
      if (active) setMounted(true);
    });
    return () => {
      active = false;
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (serverStats) dispatch(hydrateProjectStats({ projectId, stats: serverStats }));
  }, [
    dispatch,
    projectId,
    serverStats,
  ]);

  const auditBase = `${base}/audit`;
  type NavLeaf = {
    icon: ReactNode;
    label: string;
    href: string;
    badge?: string;
    badgeColor?: string;
    prefetchLabel: string;
    exact?: boolean;
    children?: { label: string; href: string; exact?: boolean }[];
  };

  const navItems: NavLeaf[] = [
    {
      icon: Icon.grid,
      label: "Overview",
      href: base,
      prefetchLabel: "Overview"
    },
    {
      icon: Icon.search,
      label: "Keyword Discovery",
      href: `${base}/keywords`,
      badge: navCountsReady && liveStats?.approvedKeywords ? `${liveStats.approvedKeywords}` : undefined,
      prefetchLabel: "Keywords",
    },
    {
      icon: Icon.calendar,
      label: "Content Calendar",
      href: `${base}/content-calendar`,
      prefetchLabel: "Content Calendar",
    },
    {
      icon: Icon.contentGen,
      label: "Content Generator",
      href: `${base}/content-generator`,
      prefetchLabel: "Content Generator",
      children: [
        { label: "Blog articles", href: `${base}/content-generator/blogs` },
        { label: "Ebooks", href: `${base}/content-generator/ebooks` },
        { label: "Whitepapers", href: `${base}/content-generator/whitepapers` },
        { label: "LinkedIn posts", href: `${base}/content-generator/linkedin` },
      ],
    },
    {
      icon: Icon.articles,
      label: "Content History",
      href: `${base}/content-history`,
      prefetchLabel: "Content History",
    },
    {
      icon: Icon.audit,
      label: "Content Health",
      href: auditBase,
      badge: navCountsReady && liveStats?.auditPending ? `${liveStats.auditPending}` : undefined,
      badgeColor: navCountsReady && liveStats?.auditPending ? "bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/20" : undefined,
      prefetchLabel: "Content Health",
      children: [
        { label: "Health Report", href: auditBase, exact: true },
        { label: "Page Explorer", href: `${auditBase}/discover-pages` },
        { label: "Content Analyzer", href: `${auditBase}/import` },
      ],
    },
  ];

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : href === base ? pathname === base : pathname.startsWith(href);

  const groupActive = (item: NavLeaf) =>
    item.children?.some(c => c.exact ? pathname === c.href : isActive(c.href)) || isActive(item.href, item.exact);

  return (
    <aside 
      className={`h-screen fixed left-0 top-0 border-r rounded-r-lg border-border-subtle bg-surface-secondary flex flex-col z-60 transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-[80px]" : "w-[280px]"
      }`}
    >
      {/* Logo & Toggle Header */}
      <div className={`p-6 pb-4 flex flex-col transition-all duration-300 ease-in-out ${isCollapsed ? "items-center px-2" : ""}`}>
        <div className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between"} mb-8 relative group w-full`}>
          <Link
            href="/"
            className={`flex items-center transition-all duration-300 ease-in-out ${isCollapsed ? "opacity-100 group-hover:opacity-0" : ""}`}
          >
            <Logo size="md" markOnly={isCollapsed} className={isCollapsed ? "" : ""} />
          </Link>

          {isCollapsed ? (
            <button
              onClick={() => setIsCollapsed(false)}
              className="absolute inset-0 m-auto w-8 h-8 flex items-center justify-center rounded-[8px] bg-surface-elevated border border-border-subtle text-text-primary shadow-sm opacity-0 group-hover:opacity-100 transition-all duration-200 scale-90 group-hover:scale-100 z-10"
              title="Expand sidebar"
            >
              {Icon.chevronRight}
            </button>
          ) : (
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1.5 rounded-[8px] text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-colors shrink-0"
              title="Collapse sidebar"
            >
              {Icon.chevronLeft}
            </button>
          )}
        </div>

        {/* Project badge / Dropdown */}
        <div className="relative w-full" ref={dropdownRef}>
          <button 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className={`w-full relative flex items-center text-left rounded-[12px] bg-surface-elevated border border-border-subtle shadow-sm hover:border-brand-action/30 transition-all duration-300 ease-in-out overflow-hidden ${
              isCollapsed ? "h-[56px]" : "h-[88px]"
            }`}
          >
            {/* Expanded Content */}
            <div className={`absolute inset-0 p-4 flex items-center justify-between transition-all duration-300 ease-in-out ${isCollapsed ? "opacity-0 translate-x-[-20px] pointer-events-none" : "opacity-100 translate-x-0"}`}>
              <div className="flex-1 min-w-0 pr-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1.5">Current Project</p>
                <p className="text-[14px] font-medium text-text-primary truncate">
                  {project ? project.name : <span className="inline-block w-24 h-4 bg-surface-tertiary animate-pulse rounded" />}
                </p>
                <p className="text-[12px] text-text-tertiary truncate font-mono mt-0.5">
                  {project ? project.domain : <span className="inline-block w-32 h-3.5 bg-surface-tertiary/60 animate-pulse rounded mt-1" />}
                </p>
              </div>
              <div className={`text-text-tertiary transition-transform duration-200 ${isDropdownOpen ? "rotate-180" : ""}`}>
                {Icon.chevronDown}
              </div>
            </div>

            {/* Collapsed Content */}
            <div className={`absolute inset-0 p-2 flex items-center justify-center transition-all duration-300 ease-in-out ${isCollapsed ? "opacity-100 translate-x-0" : "opacity-0 translate-x-[20px] pointer-events-none"}`}>
              <div className="w-10 h-10 rounded-[8px] bg-surface-tertiary flex items-center justify-center text-[16px] font-bold text-text-primary uppercase">
                {project ? project.name.charAt(0) : "…"}
              </div>
            </div>
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div className={`absolute top-full left-0 mt-2 bg-surface-elevated border border-border-subtle rounded-[12px] shadow-sm overflow-hidden z-50 py-2 ${
              isCollapsed ? "w-[240px] left-full ml-2 top-0 mt-0" : "w-full"
            }`}>
              <div className="px-3 pb-2 mb-2 border-b border-border-subtle">
                <p className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary">Switch Project</p>
              </div>
              <div className="max-h-[240px] overflow-y-auto">
                {allProjects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setIsDropdownOpen(false);
                      router.push(`/projects/${p.id}`);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-hover transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0 pr-3">
                      <p className={`text-[13px] font-medium truncate ${project && p.id === project.id ? "text-brand-action" : "text-text-primary"}`}>
                        {p.name}
                      </p>
                      <p className="text-[11px] text-text-tertiary truncate font-mono">{p.domain}</p>
                    </div>
                    {project && p.id === project.id && (
                      <span className="text-brand-action shrink-0">{Icon.check}</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="px-3 pt-2 pb-1 mt-2 border-t border-border-subtle space-y-1.5">
                <ProjectNavLink
                  href="/projects"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
                >
                  {Icon.grid}
                  View all projects
                </ProjectNavLink>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Project Nav */}
      <nav className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${isCollapsed ? "px-2" : "px-4"}`}>
        <p className={`text-[12px] font-bold uppercase tracking-widest text-text-tertiary mb-4 mt-2 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap ${isCollapsed ? "max-h-0 opacity-0 m-0" : "max-h-[20px] opacity-100 px-4"}`}>
          Project
        </p>
        <ul className="space-y-1.5 mb-6">
          {navItems.map((item) => {
            const active = item.children ? groupActive(item) : isActive(item.href, item.exact);
            return (
              <li key={item.label}>
                <ProjectNavLink
                  href={item.href}
                  enablePrefetch
                  className={`flex items-center rounded-[8px] text-[14px] font-medium transition-all duration-300 ease-in-out group relative
                    ${isCollapsed ? "justify-center p-3" : "px-4 py-3"}
                    ${active
                      ? "bg-surface-elevated text-brand-action border border-border-subtle shadow-sm"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-hover border border-transparent"}`}
                >
                  <span className={`shrink-0 transition-colors duration-300 ${active ? "text-brand-action" : "text-text-tertiary group-hover:text-text-primary"}`}>
                    {item.icon}
                  </span>

                  <span className={`whitespace-nowrap transition-all duration-300 ease-in-out overflow-hidden flex-1 ${isCollapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[200px] opacity-100 ml-3"}`}>
                    {item.label}
                  </span>

                  <span className={`shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${isCollapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[100px] opacity-100 ml-2"}`}>
                    {item.badge && (
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-[4px] border ${item.badgeColor || "bg-surface-tertiary text-text-secondary border-border-subtle"}`}>
                        {item.badge}
                      </span>
                    )}
                  </span>

                  {isCollapsed && (
                    <div className="absolute left-full ml-2 px-2 py-1 bg-surface-elevated border border-border-subtle text-text-primary text-[12px] rounded-[4px] shadow-sm opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                      {item.label}
                      {item.children && (
                        <span className="block text-[10px] text-text-tertiary mt-1">
                          {item.children.map(c => c.label).join(" · ")}
                        </span>
                      )}
                      {navCountsReady && item.badge && (
                        <span className="ml-2 text-text-tertiary">({item.badge})</span>
                      )}
                    </div>
                  )}
                </ProjectNavLink>

                {!isCollapsed && item.children && (
                  <ul className="mt-1.5 ml-4 space-y-0.5 overflow-hidden">
                    {item.children.map(sub => {
                      const subActive = sub.exact ? pathname === sub.href : isActive(sub.href);
                      return (
                        <li key={sub.href}>
                          <ProjectNavLink
                            href={sub.href}
                            className={`group flex items-center gap-2.5 rounded-[8px] px-3 py-2 text-[13px] font-medium transition-all duration-150
                              ${subActive
                                ? "bg-brand-action/10 text-brand-action"
                                : "text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
                              }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all duration-150 ${
                                subActive
                                  ? "bg-brand-action scale-125"
                                  : "bg-text-tertiary/40 group-hover:bg-text-tertiary"
                              }`}
                            />
                            {sub.label}
                          </ProjectNavLink>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        <div className={`border-t border-border-subtle pt-6 transition-all duration-300 ease-in-out ${isCollapsed ? "flex justify-center" : ""}`}>
          <ul className="space-y-1.5 w-full">
            <li>
              <ProjectNavLink
                href="/projects"
                className={`flex items-center rounded-[8px] text-[14px] font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-all duration-300 ease-in-out border border-transparent group relative
                  ${isCollapsed ? "justify-center p-3" : "px-4 py-3"}
                `}
              >
                <span className="text-text-tertiary group-hover:text-text-primary transition-colors shrink-0">
                  {Icon.arrowLeft}
                </span>
                
                <span className={`whitespace-nowrap transition-all duration-300 ease-in-out overflow-hidden ${isCollapsed ? "max-w-0 opacity-0 ml-0" : "max-w-[200px] opacity-100 ml-3"}`}>
                  All Projects
                </span>
                
                {isCollapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-surface-elevated border border-border-subtle text-text-primary text-[12px] rounded-[4px] shadow-sm opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                    All Projects
                  </div>
                )}
              </ProjectNavLink>
            </li>
          </ul>
        </div>
      </nav>

      {/* Footer Actions (User) */}
      <div className="p-4 border-t border-border-subtle flex flex-col gap-2">
        {/* User & Theme */}
        <div className={`flex items-center rounded-[12px] bg-surface-elevated border border-border-subtle shadow-sm transition-all duration-300 ease-in-out ${
          isCollapsed ? "p-2 flex-col gap-3" : "p-4 justify-between"
        }`}>
          <div className={`flex items-center overflow-hidden transition-all duration-300 ease-in-out ${isCollapsed ? "justify-center gap-0" : "gap-3"}`}>
            <div className="shrink-0 transition-all duration-300 ease-in-out">
              <UserButton appearance={{ elements: { avatarBox: isCollapsed ? "w-8 h-8 rounded-[8px] transition-all" : "w-10 h-10 rounded-[8px] transition-all" } }} />
            </div>
            <div className={`flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${isCollapsed ? "max-w-0 opacity-0" : "max-w-[120px] opacity-100"}`}>
              <span className="text-[14px] font-medium text-text-primary truncate">Account</span>
              <span className="text-[12px] text-text-tertiary truncate leading-none mt-0.5">Manage profile</span>
            </div>
          </div>
          <div className={`transition-all duration-300 ease-in-out flex justify-center ${isCollapsed ? "w-full border-t border-border-subtle pt-3" : ""}`}>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </aside>
  );
}
