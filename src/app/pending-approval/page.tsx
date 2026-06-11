"use client";

import { useEffect, useState } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function PendingApprovalPage() {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const [checkCount, setCheckCount] = useState(0);

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.replace("/sign-in");
      return;
    }

    if (user.publicMetadata?.approved !== false) {
      router.replace("/dashboard");
      return;
    }

    const interval = setInterval(async () => {
      try {
        await user.reload();
        if (user.publicMetadata?.approved !== false) {
          router.replace("/dashboard");
        }
      } catch {
        // silent
      }
      setCheckCount((n) => n + 1);
    }, 30_000);

    return () => clearInterval(interval);
  }, [isLoaded, user, router]);

  if (!isLoaded || !user) return null;

  return (
    <div className="relative min-h-screen bg-surface-primary flex items-center justify-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand-action/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-brand-action/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md mx-auto px-4">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-brand-action flex items-center justify-center">
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <span className="text-[18px] font-semibold text-text-primary tracking-tight">
              Rankit
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-border-default bg-surface-secondary p-8 shadow-2xl text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
            <svg
              className="h-7 w-7 text-amber-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <path strokeWidth="2" strokeLinecap="round" d="M12 7v5l3 3" />
            </svg>
          </div>

          <h1 className="text-[20px] font-semibold text-text-primary mb-2">
            Account pending approval
          </h1>
          <p className="text-[14px] text-text-secondary mb-6">
            Your account is awaiting admin approval before you can access the platform.
          </p>

          <div className="rounded-lg bg-surface-primary border border-border-default px-4 py-3 mb-6">
            <p className="text-[13px] text-text-tertiary">
              Signed in as{" "}
              <span className="font-medium text-text-primary">
                {user.primaryEmailAddress?.emailAddress}
              </span>
            </p>
          </div>

          <p className="text-[12px] text-text-tertiary mb-6">
            This page checks automatically every 30 seconds.
            {checkCount > 0 && (
              <span className="ml-1 text-text-quaternary">
                (checked {checkCount}×)
              </span>
            )}
          </p>

          <button
            type="button"
            onClick={() => user.reload().then(() => {
              if (user.publicMetadata?.approved !== false) router.replace("/dashboard");
            })}
            className="w-full h-9 rounded-lg bg-brand-action text-white text-[13px] font-medium hover:opacity-90 transition-opacity mb-3"
          >
            Check now
          </button>

          <button
            type="button"
            onClick={() => void signOut(() => router.replace("/sign-in"))}
            className="inline-flex items-center gap-1.5 text-[13px] text-text-tertiary hover:text-text-secondary transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
