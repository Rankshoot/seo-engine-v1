"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode, useMemo } from "react";
import Link from "next/link";
import { ProjectNavLink } from "@/components/ProjectNavLink";
import { usePathname, useRouter } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { Project } from "@/lib/types";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/brand/Logo";
import { qk } from "@/lib/query";
import { useAppDispatch, useAppSelector, selectProjectStats } from "@/lib/redux/hooks";
import { hydrateProjectStats } from "@/lib/redux/keyword-workspace-slice";
import { projectsApi } from "@/frontend/api/projects";
import { useUserQuota } from "@/hooks/useUserQuota";

const Icon = {
  grid: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="7" height="7" x="3" y="3" rx="1.5"/>
      <rect width="7" height="7" x="14" y="3" rx="1.5"/>
      <rect width="7" height="7" x="14" y="14" rx="1.5"/>
      <rect width="7" height="7" x="3" y="14" rx="1.5"/>
    </svg>
  ),
  search: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.3-4.3"/>
    </svg>
  ),
  calendar: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
      <line x1="16" x2="16" y1="2" y2="6"/>
      <line x1="8" x2="8" y1="2" y2="6"/>
      <line x1="3" x2="21" y1="10" y2="10"/>
    </svg>
  ),
  audit: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  chevronDown: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6"/>
    </svg>
  ),
  chevronRight: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  ),
  chevronLeft: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-6-6 6-6"/>
    </svg>
  ),
  check: (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
  ),
  arrowLeft: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 19-7-7 7-7"/>
      <path d="M19 12H5"/>
    </svg>
  ),
  contentGen: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10.4 12.6a2 2 0 1 1 3 3L8 21l-4 1 1-4Z" />
    </svg>
  ),
  articles: (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 3H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h1" strokeOpacity={0.35} />
      <path d="M9 3h8.5L19 6.5V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M9 9h6" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  ),
  sparkle: (
    <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9.8 15.9 9 18.8l-.8-2.9a4.5 4.5 0 0 0-3.1-3.1L2.3 12l2.8-.8a4.5 4.5 0 0 0 3.1-3.1L9 5.3l.8 2.8a4.5 4.5 0 0 0 3.1 3.1l2.8.8-2.8.8a4.5 4.5 0 0 0-3.1 3.1Z"/>
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
  const { user } = useUser();
  const { quota } = useUserQuota();

  const { data: statsResponse } = useQuery({
    queryKey: qk.projectStats(projectId),
    queryFn: () => projectsApi.stats(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
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
  const auditBase = `${base}/audit`;

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navCountsReady = mounted;

  useEffect(() => {
    let active = true;
    requestAnimationFrame(() => { if (active) setMounted(true); });
    return () => { active = false; };
  }, []);

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
  }, [dispatch, projectId, serverStats]);

  type NavLeaf = {
    icon: ReactNode;
    label: string;
    href: string;
    badge?: string;
    badgeColor?: string;
    prefetchLabel: string;
    exact?: boolean;
    disabled?: boolean;
    children?: { label: string; href: string; exact?: boolean }[];
  };

  const isActive = useCallback((href: string, exact?: boolean) =>
    exact ? pathname === href : href === base ? pathname === base : pathname.startsWith(href),
    [pathname, base]
  );

  const groupActive = useCallback((item: NavLeaf) =>
    item.children?.some(c => c.exact ? pathname === c.href : isActive(c.href)) || isActive(item.href, item.exact),
    [pathname, isActive]
  );

  const navItems = useMemo((): NavLeaf[] => [
    {
      icon: Icon.grid,
      label: "Overview",
      href: base,
      prefetchLabel: "Overview",
      exact: true,
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
      badge: "Soon",
      badgeColor: "bg-surface-tertiary/50 text-text-tertiary border-border-subtle opacity-50",
      prefetchLabel: "Content Health",
      disabled: true,
    },
  ], [base, auditBase, navCountsReady, liveStats]);

  /* ── Derived plan info ── */
  const userName = user?.firstName ?? user?.username ?? "You";
  const planName = quota?.planName ?? "Free";

  // Aggregate content quotas (blogs + ebooks + whitepapers + linkedin)
  const contentQuotas = {
    blogs: quota?.blogs,
    ebooks: quota?.ebooks,
    whitepapers: quota?.whitepapers,
    linkedin: quota?.linkedin,
  };

  const contentLeft = quota
    ? (quota.blogs?.remaining ?? 0) +
      (quota.ebooks?.remaining ?? 0) +
      (quota.whitepapers?.remaining ?? 0) +
      (quota.linkedin?.remaining ?? 0)
    : null;

  const contentLimit = quota
    ? (quota.blogs?.effectiveLimit ?? 0) +
      (quota.ebooks?.effectiveLimit ?? 0) +
      (quota.whitepapers?.effectiveLimit ?? 0) +
      (quota.linkedin?.effectiveLimit ?? 0)
    : null;

  const aiLeft = quota?.ai_credits?.remaining ?? null;
  const aiLimit = quota?.ai_credits?.effectiveLimit ?? null;

  const showLimits = contentLeft !== null && contentLimit !== null && contentLimit > 0;

  return (
    <aside
      className={`h-screen fixed left-0 top-0 border-r border-border-subtle/60 bg-surface-primary flex flex-col z-60 transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-[68px]" : "w-[260px]"
      }`}
      style={{
        background: "color-mix(in srgb, var(--surface-primary) 96%, var(--brand-violet) 4%)",
      }}
    >
      {/* Subtle top glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[200px] opacity-40"
        style={{
          background: "radial-gradient(ellipse at 50% -30%, rgba(99,102,241,0.18) 0%, transparent 70%)",
        }}
      />

      {/* ── Logo & Collapse toggle ── */}
      <div className={`relative z-10 flex items-center border-b border-border-subtle/40 transition-all duration-300 ease-in-out ${
        isCollapsed ? "justify-center px-2 h-14" : "justify-between px-4 h-14"
      }`}>
        {isCollapsed ? (
          /* Collapsed: show logo mark, expand button appears on hover */
          <div className="group relative flex items-center justify-center">
            <Link
              href="/"
              className="flex items-center justify-center w-9 h-9 rounded-[10px] bg-brand-violet/10 transition-all group-hover:opacity-0 group-hover:scale-90 group-hover:pointer-events-none"
              tabIndex={-1}
            >
              <Logo size="xs" markOnly />
            </Link>
            <button
              onClick={() => setIsCollapsed(false)}
              className="absolute inset-0 flex items-center justify-center w-9 h-9 rounded-[10px] border border-border-subtle bg-surface-elevated text-text-secondary hover:text-brand-violet hover:border-brand-violet/30 transition-all shadow-sm opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              {Icon.chevronRight}
            </button>
          </div>
        ) : (
          <>
            <Link href="/" className="flex items-center">
              <Logo size="sm" />
            </Link>
            <button
              onClick={() => setIsCollapsed(true)}
              className="flex items-center justify-center w-7 h-7 rounded-[6px] text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-all"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              {Icon.chevronLeft}
            </button>
          </>
        )}
      </div>

      {/* ── Project switcher ── */}
      <div className={`relative z-[60] transition-all duration-300 ease-in-out ${isCollapsed ? "px-2 py-2" : "px-3 py-3"}`} ref={dropdownRef}>
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          aria-expanded={isDropdownOpen}
          aria-haspopup="menu"
          className={`w-full group relative flex items-center text-left rounded-[10px] border transition-all duration-200 overflow-hidden ${
            isDropdownOpen
              ? "border-brand-violet/40 bg-brand-violet/8 shadow-[0_0_0_3px_rgba(99,102,241,0.08)]"
              : "border-border-subtle bg-surface-elevated hover:border-brand-violet/25 hover:bg-surface-hover"
          } ${isCollapsed ? "h-[46px] justify-center" : "h-[72px]"}`}
        >
          {/* Expanded */}
          <div className={`absolute inset-0 px-3 py-2.5 flex items-center justify-between transition-all duration-300 ${
            isCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}>
            <div className="flex-1 min-w-0 pr-2">
              <p className="text-[9.5px] font-bold uppercase tracking-[0.12em] text-text-tertiary mb-1">Current Project</p>
              <p className="text-[13px] font-semibold text-text-primary truncate leading-tight">
                {project ? project.name : <span className="inline-block w-20 h-3.5 bg-surface-tertiary animate-pulse rounded" />}
              </p>
              <p className="text-[11px] text-text-tertiary truncate font-mono mt-0.5">
                {project ? project.domain : <span className="inline-block w-28 h-3 bg-surface-tertiary/50 animate-pulse rounded mt-0.5" />}
              </p>
            </div>
            <span className={`text-text-tertiary shrink-0 transition-transform duration-200 ${isDropdownOpen ? "rotate-180 text-brand-violet" : ""}`}>
              {Icon.chevronDown}
            </span>
          </div>

          {/* Collapsed */}
          <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
            isCollapsed ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}>
            <div className="w-8 h-8 rounded-[8px] bg-brand-violet/15 flex items-center justify-center text-[13px] font-bold text-brand-violet uppercase">
              {project ? project.name.charAt(0) : "·"}
            </div>
          </div>
        </button>

        {/* Dropdown */}
        {isDropdownOpen && (
          <div className={`absolute top-full bg-surface-elevated border border-border-subtle rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden z-[100] py-1.5 ${
            isCollapsed ? "w-[220px] left-full ml-2 top-2 mt-0" : "w-full left-3 right-3"
          }`}>
            <div className="px-3 py-2 border-b border-border-subtle mb-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-tertiary">Switch Project</p>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {allProjects.map((p) => (
                <button
                  key={p.id}
                  onClick={async () => {
                    setIsDropdownOpen(false);
                    await router.push(`/projects/${p.id}`);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-hover transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className={`w-6 h-6 rounded-[6px] flex items-center justify-center text-[11px] font-bold uppercase shrink-0 ${
                      project && p.id === project.id
                        ? "bg-brand-violet/15 text-brand-violet"
                        : "bg-surface-tertiary text-text-secondary"
                    }`}>
                      {p.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-[12.5px] font-medium truncate ${
                        project && p.id === project.id ? "text-brand-violet" : "text-text-primary"
                      }`}>{p.name}</p>
                      <p className="text-[10.5px] text-text-tertiary truncate font-mono">{p.domain}</p>
                    </div>
                  </div>
                  {project && p.id === project.id && (
                    <span className="text-brand-violet shrink-0 ml-2">{Icon.check}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="border-t border-border-subtle mt-1 pt-1 px-2 pb-1">
              <ProjectNavLink
                href="/projects"
                onClick={() => setIsDropdownOpen(false)}
                className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="7" height="7" x="3" y="3" rx="1.5"/><rect width="7" height="7" x="14" y="3" rx="1.5"/>
                  <rect width="7" height="7" x="14" y="14" rx="1.5"/><rect width="7" height="7" x="3" y="14" rx="1.5"/>
                </svg>
                All projects
              </ProjectNavLink>
            </div>
          </div>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav className={`relative z-10 flex-1 overflow-y-auto overflow-x-hidden py-2 transition-all duration-300 ease-in-out ${isCollapsed ? "px-2" : "px-2"}`}>
        {!isCollapsed && (
          <p className="px-3 mb-2 text-[9.5px] font-bold uppercase tracking-[0.12em] text-text-tertiary/60">
            Navigation
          </p>
        )}

        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const active = item.children ? groupActive(item) : isActive(item.href, item.exact);
            const isExpanded = !isCollapsed && item.children && !item.disabled && (active || pathname.startsWith(item.href));

            return (
              <li key={item.label}>
                <ProjectNavLink
                  href={item.disabled ? "#" : item.href}
                  enablePrefetch={!item.disabled}
                  className={`group relative flex items-center rounded-[8px] text-[13px] font-medium transition-all duration-200 select-none
                    ${isCollapsed ? "justify-center p-2.5 mx-0" : "px-3 py-2.5 mx-0"}
                    ${item.disabled
                      ? "text-text-tertiary/40 cursor-not-allowed pointer-events-none"
                      : active
                        ? "bg-brand-violet/10 text-brand-violet shadow-[0_0_0_1px_rgba(99,102,241,0.15),inset_0_0_16px_rgba(99,102,241,0.04)]"
                        : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                    }`}
                >
                  <span className={`shrink-0 transition-colors duration-200 ${
                    active ? "text-brand-violet" : item.disabled ? "text-text-tertiary/30" : "text-text-tertiary group-hover:text-text-secondary"
                  }`}>
                    {item.icon}
                  </span>

                  {!isCollapsed && (
                    <>
                      <span className="flex-1 ml-2.5 truncate">{item.label}</span>
                      {item.badge && (
                        <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-[4px] border ${
                          item.badgeColor ?? (active
                            ? "bg-brand-violet/20 text-brand-violet border-brand-violet/20"
                            : "bg-surface-secondary text-text-tertiary border-border-subtle")
                        }`}>
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}

                  {/* Collapsed tooltip */}
                  {isCollapsed && (
                    <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-surface-elevated border border-border-subtle text-text-primary text-[12px] rounded-[8px] shadow-[0_4px_16px_rgba(0,0,0,0.12)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none">
                      {item.label}
                      {item.badge && <span className="ml-1.5 text-text-tertiary">· {item.badge}</span>}
                    </div>
                  )}
                </ProjectNavLink>

                {/* Sub-items (expanded) */}
                {isExpanded && (
                  <ul className="mt-0.5 ml-3 space-y-0.5 border-l border-border-subtle/50 pl-3">
                    {item.children!.map(sub => {
                      const subActive = sub.exact ? pathname === sub.href : isActive(sub.href);
                      return (
                        <li key={sub.href}>
                          <ProjectNavLink
                            href={sub.href}
                            className={`group flex items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-[12px] font-medium transition-all duration-150 ${
                              subActive
                                ? "bg-brand-violet/10 text-brand-violet"
                                : "text-text-tertiary hover:text-text-primary hover:bg-surface-hover"
                            }`}
                          >
                            <span className={`w-1 h-1 rounded-full shrink-0 transition-all ${
                              subActive ? "bg-brand-violet scale-125" : "bg-text-tertiary/30 group-hover:bg-text-tertiary/60"
                            }`} />
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

        {/* All Projects link */}
        <div className="mt-4 pt-3 border-t border-border-subtle/40">
          <ProjectNavLink
            href="/projects"
            className={`group relative flex items-center rounded-[8px] text-[13px] font-medium text-text-tertiary hover:text-text-secondary hover:bg-surface-hover transition-all duration-200 ${
              isCollapsed ? "justify-center p-2.5" : "px-3 py-2"
            }`}
          >
            <span className="shrink-0">{Icon.arrowLeft}</span>
            {!isCollapsed && <span className="ml-2.5">All Projects</span>}
            {isCollapsed && (
              <div className="absolute left-full ml-3 px-2.5 py-1.5 bg-surface-elevated border border-border-subtle text-text-primary text-[12px] rounded-[8px] shadow-[0_4px_16px_rgba(0,0,0,0.12)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50">
                All Projects
              </div>
            )}
          </ProjectNavLink>
        </div>
      </nav>

      {/* ── User & Plan footer ── */}
      <div className="relative z-10 border-t border-border-subtle/40 p-3">
        <div className={`rounded-[10px] bg-surface-elevated border border-border-subtle/60 transition-all duration-300 ${
          isCollapsed ? "p-2" : "p-3"
        }`}>
          {isCollapsed ? (
            /* Collapsed: just avatar */
            <div className="flex flex-col items-center gap-2">
              <UserButton appearance={{ elements: { avatarBox: "w-8 h-8 rounded-[8px]" } }} />
              <ThemeToggle />
            </div>
          ) : (
            /* Expanded: avatar + name + plan limits */
            <div className="space-y-2.5">
              <div className="flex items-center gap-2.5">
                <UserButton appearance={{ elements: { avatarBox: "w-8 h-8 rounded-[8px] shrink-0" } }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-text-primary truncate leading-tight">{userName}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-violet">
                      {Icon.sparkle}
                      {planName}
                    </span>
                  </div>
                </div>
                <ThemeToggle />
              </div>

              {/* Plan limits */}
              {showLimits && (
                <div className="space-y-1.5 pt-2 border-t border-border-subtle/40">
                  <LimitBar
                    label="Content"
                    used={(contentLimit ?? 0) - (contentLeft ?? 0)}
                    total={contentLimit ?? 0}
                    remaining={contentLeft ?? 0}
                    breakdown={contentQuotas}
                  />
                  {aiLeft !== null && aiLimit !== null && (
                    <LimitBar
                      label="AI credits"
                      used={aiLimit - aiLeft}
                      total={aiLimit}
                      remaining={aiLeft}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

interface QuotaItem {
  limit: number;
  used: number;
  override: number | null;
  effectiveLimit: number;
  remaining: number;
}

function LimitBar({
  label,
  used,
  total,
  remaining,
  breakdown,
}: {
  label: string;
  used: number;
  total: number;
  remaining: number;
  breakdown?: Record<string, QuotaItem | undefined>;
}) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const isLow = remaining < total * 0.2;
  const hasBreakdown = breakdown && Object.values(breakdown).some((q) => q && q.effectiveLimit > 0);

  const contentLabels: Record<string, string> = {
    blogs: "Blog articles",
    ebooks: "Ebooks",
    whitepapers: "Whitepapers",
    linkedin: "LinkedIn posts",
  };

  return (
    <div className={`space-y-0.5 ${hasBreakdown ? "group relative" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-text-tertiary">{label}</span>
        <span className={`text-[10.5px] font-medium tabular-nums ${isLow ? "text-status-warning" : "text-text-secondary"}`}>
          {remaining} left
        </span>
      </div>
      <div className="h-1 rounded-full bg-surface-tertiary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${isLow ? "bg-status-warning" : "bg-brand-violet"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Hover tooltip with breakdown - positioned above */}
      {hasBreakdown && (
        <div className="absolute left-0 right-0 bottom-[calc(100%+6px)] px-2.5 py-2 bg-surface-elevated border border-border-subtle rounded-[8px] shadow-[0_4px_16px_rgba(0,0,0,0.12)] opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none" style={{ zIndex: 9999 }}>
          <p className="text-[10px] font-semibold text-text-secondary mb-1.5">Content breakdown</p>
          <div className="space-y-1">
            {Object.entries(breakdown)
              .filter(([, q]) => q && q.effectiveLimit > 0)
              .map(([key, q]) => (
                <div key={key} className="flex items-center justify-between text-[10.5px]">
                  <span className="text-text-tertiary">{contentLabels[key] ?? key}</span>
                  <span className="font-medium tabular-nums text-text-secondary">{q?.remaining} left</span>
                </div>
              ))}
          </div>
          {/* Arrow pointing down */}
          <div className="absolute top-full left-1/2 -translate-x-1/2">
            <div className="w-2 h-2 bg-surface-elevated border-r border-b border-border-subtle rotate-45 -mt-[3px]" />
          </div>
        </div>
      )}
    </div>
  );
}
