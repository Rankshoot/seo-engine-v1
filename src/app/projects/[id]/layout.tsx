import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import ProjectLayoutClient from "@/components/dashboard/ProjectLayoutClient";
import { isReservedProjectSlug } from "@/lib/projects/reserved-project-slugs";

/**
 * Project shell — lightweight server component.
 *
 * Auth is enforced at the middleware layer (`auth.protect()` in middleware.ts).
 * We only verify `userId` here as a fast synchronous check using the JWT that
 * middleware already validated — no network call, unlike `currentUser()`.
 *
 * Maintenance mode redirect is handled at the middleware level so it does not
 * block every in-app navigation.
 *
 * Project / stats / brief / list data load client-side via TanStack Query in
 * `ProjectLayoutClient` so navigation is never blocked on DB round-trips.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { id } = await params;

  // Admin path redirect already handled in middleware.ts
  if (isReservedProjectSlug(id)) {
    if (id.toLowerCase() === "new") redirect("/projects/new");
    redirect("/dashboard");
  }

  return <ProjectLayoutClient projectId={id}>{children}</ProjectLayoutClient>;
}
