"use client";

import { useEffect, useState } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

async function checkApprovalStatus(): Promise<string> {
  try {
    const res = await fetch("/api/v1/me/approval-status");
    const json = await res.json() as { status: string };
    return json.status ?? "pending";
  } catch {
    return "db_error";
  }
}

export default function PendingApprovalPage() {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();
  const [status, setStatus] = useState<string>("pending");
  const [checkCount, setCheckCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const checkStatus = async () => {
    setLoading(true);
    const s = await checkApprovalStatus();
    setStatus(s);
    setLoading(false);
    if (s === "approved") {
      router.replace("/dashboard");
    } else if (s === "unauthenticated") {
      router.replace("/sign-in");
    }
  };

  useEffect(() => {
    if (!isLoaded) return;
    if (!user) {
      router.replace("/sign-in");
      return;
    }

    // Initial check
    void checkStatus();
  }, [isLoaded, user]);

  useEffect(() => {
    if (!isLoaded || !user) return;
    if (status === "denied" || status === "revoked" || status === "unauthenticated" || status === "approved") {
      return;
    }

    const interval = setInterval(async () => {
      const s = await checkApprovalStatus();
      setStatus(s);
      setCheckCount((n) => n + 1);
      if (s === "approved") {
        router.replace("/dashboard");
      } else if (s === "unauthenticated") {
        router.replace("/sign-in");
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [isLoaded, user, router, status]);

  if (!isLoaded || !user) return null;

  const renderContent = () => {
    switch (status) {
      case "denied":
        return (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
              <svg
                className="h-7 w-7 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-[20px] font-semibold text-text-primary mb-2">
              Access Denied
            </h1>
            <p className="text-[14px] text-text-secondary mb-6">
              Your registration request has been reviewed and denied by an administrator.
            </p>
          </>
        );
      case "revoked":
        return (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
              <svg
                className="h-7 w-7 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-[20px] font-semibold text-text-primary mb-2">
              Access Revoked
            </h1>
            <p className="text-[14px] text-text-secondary mb-6">
              Your access to the platform has been revoked. If you believe this is an error, please contact support.
            </p>
          </>
        );
      case "not_found":
        return (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/10">
              <svg
                className="h-7 w-7 text-orange-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-[20px] font-semibold text-text-primary mb-2">
              Account Unregistered
            </h1>
            <p className="text-[14px] text-text-secondary mb-6">
              There is no active approval request for this user. Please contact an administrator.
            </p>
          </>
        );
      case "db_error":
        return (
          <>
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/10">
              <svg
                className="h-7 w-7 text-orange-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h1 className="text-[20px] font-semibold text-text-primary mb-2">
              Connection Timeout
            </h1>
            <p className="text-[14px] text-text-secondary mb-6">
              We had trouble contacting the service database. Please check your connection and try again.
            </p>
          </>
        );
      case "pending":
      default:
        return (
          <>
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
          </>
        );
    }
  };

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
          {renderContent()}

          <div className="rounded-lg bg-surface-primary border border-border-default px-4 py-3 mb-6">
            <p className="text-[13px] text-text-tertiary">
              Signed in as{" "}
              <span className="font-medium text-text-primary">
                {user.primaryEmailAddress?.emailAddress}
              </span>
            </p>
          </div>

          {status === "pending" && (
            <p className="text-[12px] text-text-tertiary mb-6">
              This page checks automatically every 30 seconds.
              {checkCount > 0 && (
                <span className="ml-1 text-text-quaternary">
                  (checked {checkCount}×)
                </span>
              )}
            </p>
          )}

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              void checkStatus();
            }}
            className="w-full h-9 rounded-lg bg-brand-action text-white text-[13px] font-medium hover:opacity-90 transition-opacity mb-3 disabled:opacity-50"
          >
            {loading ? "Checking..." : "Check now"}
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
