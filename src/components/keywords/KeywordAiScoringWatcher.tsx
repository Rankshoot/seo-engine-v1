"use client";

import { useEffect, useRef } from "react";
import { toast } from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import { qk, useAiScoringRunStatus } from "@/lib/query";
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
  const prevStatus = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (prevStatus.current === "running" && data?.status === "done") {
      toast.success(`${label}: AI scoring finished (${data.total} scored)`);
      void queryClient.invalidateQueries({ queryKey: qk.keywords(projectId) });
      void queryClient.invalidateQueries({ queryKey: qk.competitors(projectId) });
    } else if (prevStatus.current === "running" && data?.status === "error") {
      toast.error(`${label}: AI scoring failed${data.error ? ` — ${data.error}` : ""}`);
    }
    prevStatus.current = data?.status;
  }, [data?.status, data?.total, data?.error, label, projectId, queryClient]);

  return null;
}
