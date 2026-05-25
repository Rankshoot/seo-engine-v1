import { cn } from "@/lib/cn";

/** Inline keyboard shortcut chip — Linear / Notion style. */
export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-border-default bg-surface-secondary px-1.5",
        "font-mono text-[10.5px] font-medium text-text-tertiary",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
