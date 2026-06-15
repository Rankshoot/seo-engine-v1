"use client";

import * as React from "react";
import * as RadixTabs from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

/**
 * Headless-driven tabs with Rankshoot styling. Use in pages that switch between
 * peer views (e.g. content history filters, audit categories).
 *
 *   <Tabs defaultValue="all">
 *     <TabsList>
 *       <TabsTrigger value="all">All</TabsTrigger>
 *       <TabsTrigger value="pending">Pending</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="all">…</TabsContent>
 *   </Tabs>
 */

export const Tabs = RadixTabs.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof RadixTabs.List>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.List>
>(function TabsList({ className, ...rest }, ref) {
  return (
    <RadixTabs.List
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface-elevated p-1",
        className,
      )}
      {...rest}
    />
  );
});

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof RadixTabs.Trigger>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Trigger>
>(function TabsTrigger({ className, ...rest }, ref) {
  return (
    <RadixTabs.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-text-tertiary",
        "transition-colors duration-(--duration-fast) ease-out",
        "hover:text-text-primary",
        "data-[state=active]:bg-surface-secondary data-[state=active]:text-text-primary data-[state=active]:shadow-(--shadow-xs)",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-action/40",
        className,
      )}
      {...rest}
    />
  );
});

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof RadixTabs.Content>,
  React.ComponentPropsWithoutRef<typeof RadixTabs.Content>
>(function TabsContent({ className, ...rest }, ref) {
  return (
    <RadixTabs.Content
      ref={ref}
      className={cn(
        "mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-action/40 rounded-lg",
        className,
      )}
      {...rest}
    />
  );
});
