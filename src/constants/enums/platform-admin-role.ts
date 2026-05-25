export const PLATFORM_ADMIN_ROLES = ["owner", "admin", "support"] as const;

export type PlatformAdminRole = (typeof PLATFORM_ADMIN_ROLES)[number];

/** Higher rank = more permissions. */
export const PLATFORM_ADMIN_ROLE_RANK: Record<PlatformAdminRole, number> = {
  support: 1,
  admin: 2,
  owner: 3,
};

export function platformAdminMeetsMinRole(
  role: PlatformAdminRole,
  minRole: PlatformAdminRole
): boolean {
  return PLATFORM_ADMIN_ROLE_RANK[role] >= PLATFORM_ADMIN_ROLE_RANK[minRole];
}
