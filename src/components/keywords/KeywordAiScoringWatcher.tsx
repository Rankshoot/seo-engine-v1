"use client";

import { useEffect, useRef } from "react";
import { toast } from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { qk, useAiScoringRunStatus } from "@/lib/query";
import { useNotify } from "@/hooks/useNotify";
import type { AiScoringScope } from "@/app/actions/ai-scoring-actions";

const SCOPES: { scope: AiScoringScope; label: string }[] = [
  { scope: "organic", label: "Organic keywords" },
  { scope: "competitor", label: "Competitor keywords" },
];

/** Fires a toast the moment a background AI-scoring run finishes, regardless of
 *  which page in the project the user is currently on (or whether they refreshed
 *  mid-run) — mounted once at the project layout level so it outlives any single
 *  tab component. */
export function KeywordAiScoringWatcher({ projectId }: { projectId: string }) {
  return (
    <>
      {SCOPES.map(({ scope, label }) => (
        <ScopeWatcher key={scope} projectId={projectId} scope={scope} label={label} />
      ))}
    </>
  );
}

function ScopeWatcher({ projectId, scope, label }: { projectId: string; scope: AiScoringScope; label: string }) {
  const { data } = useAiScoringRunStatus(projectId, scope);
  const queryClient = useQueryClient();
  const notify = useNotify();
  const prevStatus = useRef<string | undefined>(undefined);

  useEffect(() => {
    const key = `aiscore:${projectId}:${scope}`;
    const href = `/projects/${projectId}/keywords${scope === "competitor" ? "?tab=competitor" : ""}`;

    // Surface a "running" entry the first time we observe an in-flight run, so
    // the bell shows it whichever page the user is on.
    if (data?.status === "running" && prevStatus.current !== "running") {
      notify({ key, status: "running", title: `Scoring ${label.toLowerCase()}…`, projectId, os: false });
    } else if (prevStatus.current === "running" && data?.status === "done") {
      toast.success(`${label}: AI scoring finished (${data.total} scored)`);
      notify({ key, status: "success", title: `${label} scored`, body: `${data.total} keywords scored`, href, projectId, os: true });
      void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.competitors(projectId) });
    } else if (prevStatus.current === "running" && data?.status === "error") {
      toast.error(`${label}: AI scoring failed${data.error ? ` — ${data.error}` : ""}`);
      notify({ key, status: "error", title: `${label} scoring failed`, body: data.error || undefined, projectId, os: true });
    }
    prevStatus.current = data?.status;
  }, [data?.status, data?.total, data?.error, label, scope, projectId, queryClient, notify]);

  return null;
}
