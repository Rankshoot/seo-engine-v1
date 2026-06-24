"use client";

import { useState, useEffect, useRef } from "react";

export function useInView(threshold = 0.1): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

export function SectionEyebrow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-elevated px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary shadow-[var(--shadow-xs)]">
      <span className="text-brand-violet">{icon}</span>
      {label}
    </div>
  );
}

export function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`mt-4 text-balance text-4xl font-semibold tracking-[-0.028em] leading-[1.08] sm:text-[44px] ${className ?? ""}`}>
      {children}
    </h2>
  );
}

export function SectionSub({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`mt-4 max-w-[640px] text-[15px] leading-relaxed text-text-secondary ${className ?? ""}`}>
      {children}
    </p>
  );
}

export function ChatBubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${isUser ? "bg-text-primary text-surface-primary" : "border border-border-subtle bg-surface-elevated text-text-primary"}`}>
        {children}
      </div>
    </div>
  );
}
