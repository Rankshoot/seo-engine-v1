import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import ProjectLayoutClient from "@/components/dashboard/ProjectLayoutClient";

/**
 * Project shell — auth only on the server. Project / stats / brief / list data
 * load client-side via TanStack Query in `ProjectLayoutClient` so navigation
 * is never blocked on DB round-trips.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const { id } = await params;

  return <ProjectLayoutClient projectId={id}>{children}</ProjectLayoutClient>;
}
