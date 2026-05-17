import type { PlatformAdminRole } from "@/constants/enums/platform-admin-role";

export interface PlatformAdminRow {
  id: string;
  user_id: string | null;
  email: string;
  role: PlatformAdminRole;
  created_by: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface AdminSession {
  id: string;
  userId: string;
  email: string;
  role: PlatformAdminRole;
}

export type RequireAdminFailure = {
  ok: false;
  status: 401 | 403;
  error: string;
};

export type RequireAdminSuccess = {
  ok: true;
  admin: AdminSession;
};

export type RequireAdminResult = RequireAdminFailure | RequireAdminSuccess;
