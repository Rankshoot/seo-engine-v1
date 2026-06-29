"use client";

import { useEffect, useState } from "react";
import type { TocHeading } from "./blog-format";

/**
 * Sticky table of contents + reading-progress bar (progressive enhancement).
 * The sticky positioning lives on the parent <aside> in the page (self-start +
 * top offset) so it tracks the whole article. This component owns the list,
 * the active-section highlight (IntersectionObserver), and the top progress bar.
 * Headings are server-rendered with matching ids, so no content lives in JS.
 */
export function TableOfContents({ headings }: { headings: TocHeading[] }) {
  const [activeId, setActiveId] = useState<string>("");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!headings.length) return;

    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      setProgress(max > 0 ? Math.min(100, Math.max(0, (doc.scrollTop / max) * 100)) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -65% 0px", threshold: [0, 1] }
    );
    for (const h of headings) {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [headings]);

  const onClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 100, behavior: "smooth" });
      history.replaceState(null, "", `#${id}`);
    }
  };

  if (!headings.length) return null;

  return (
    <>
      {/* Reading progress bar (top of viewport). */}
      <div className="fixed inset-x-0 top-0 z-[60] h-[3px] bg-transparent">
        <div
          className="h-full bg-gradient-to-r from-brand-violet to-brand-aqua transition-[width] duration-150 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      <nav aria-label="Table of contents" className="max-h-[calc(100vh-9rem)] overflow-y-auto pr-1">
        <p className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-text-tertiary">
          On this page
        </p>
        <ul className="space-y-0.5 border-l border-border-subtle">
          {headings.map(h => {
            const active = h.id === activeId;
            return (
              <li key={h.id} className={h.level === 3 ? "ml-3" : ""}>
                <a
                  href={`#${h.id}`}
                  onClick={e => onClick(e, h.id)}
                  className={`-ml-px block border-l-2 py-1.5 pl-4 text-[13px] leading-snug transition-all duration-150 ${
                    active
                      ? "border-brand-violet font-semibold text-text-primary"
                      : "border-transparent text-text-tertiary hover:border-border-strong hover:text-text-secondary"
                  }`}
                >
                  {h.text}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
