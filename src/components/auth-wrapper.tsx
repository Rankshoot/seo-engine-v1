"use client";

import { useAuth, UserButton } from "@clerk/nextjs";
import { type ReactNode } from "react";

/** Shows children only when user is signed out */
export function AuthSignedOut({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (isSignedIn) return null;
  return <>{children}</>;
}

/** Shows children only when user is signed in */
export function AuthSignedIn({ children }: { children: ReactNode }) {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded) return null;
  if (!isSignedIn) return null;
  return <>{children}</>;
}

/** Clerk UserButton — shows avatar and sign-out */
export function AuthUserButton() {
  const { isSignedIn, isLoaded } = useAuth();
  if (!isLoaded || !isSignedIn) return null;
  return (
    <UserButton
      appearance={{
        elements: { avatarBox: "w-9 h-9 rounded-xl" },
      }}
    />
  );
}
