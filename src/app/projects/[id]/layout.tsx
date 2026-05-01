import { notFound, redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { QueryClient, dehydrate, HydrationBoundary } from "@tanstack/react-query";
import ProjectLayoutClient from "@/components/dashboard/ProjectLayoutClient";
import { getProject, getProjectStats, getProjects } from "@/app/actions/project-actions";
import { getBusinessBrief } from "@/app/actions/brief-actions";
import { qk } from "@/lib/query-keys";

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

  // Run all cheap DB reads in parallel on the server, then dehydrate the
  // results into the React Query client cache via HydrationBoundary.
  // Client components using matching query keys get data instantly — no
  // additional network calls on mount.
  const queryClient = new QueryClient();

  const [projectRes, statsRes, allProjectsRes] = await Promise.all([
    queryClient.fetchQuery({ queryKey: qk.project(id), queryFn: () => getProject(id) }),
    queryClient.fetchQuery({ queryKey: qk.projectStats(id), queryFn: () => getProjectStats(id) }),
    queryClient.fetchQuery({ queryKey: qk.projects, queryFn: () => getProjects() }),
    // Prefetch brief so the keywords page renders the brief section instantly
    // without a loading state on first visit.
    queryClient.prefetchQuery({ queryKey: qk.brief(id), queryFn: () => getBusinessBrief(id) }),
  ]);

  if (!projectRes.success || !projectRes.data) notFound();

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ProjectLayoutClient
        project={projectRes.data}
        stats={statsRes.data ?? undefined}
        allProjects={allProjectsRes.data ?? []}
      >
        {children}
      </ProjectLayoutClient>
    </HydrationBoundary>
  );
}
