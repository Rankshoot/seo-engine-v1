import type { ReactNode } from "react";

/** Root admin segment — auth/role checks live in `(dashboard)/layout`. */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return children;
}
