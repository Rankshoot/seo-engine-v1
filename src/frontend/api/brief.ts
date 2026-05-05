import type { BriefResult } from "@/app/actions/brief-actions";
import { apiGet, apiPost } from "./http";
import { V1Routes } from "./routes";

export type BriefGetResponse = {
  success: boolean;
  error?: string;
  brief: import("@/lib/business-brief").BusinessBrief | null;
  updated_at?: string;
};

export const briefApi = {
  get(projectId: string): Promise<BriefGetResponse> {
    return apiGet(V1Routes.projectBrief(projectId));
  },

  generate(projectId: string, opts: { force?: boolean } = {}): Promise<BriefResult> {
    return apiPost<BriefResult>(V1Routes.projectBrief(projectId), opts);
  },
};
