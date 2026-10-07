export type Role = "admin" | "customer";

export function canAccessTenant(
  role: Role,
  sessionTenantId: string | null,
  requestedTenantId: string,
) {
  if (role === "admin") {
    return true;
  }

  return role === "customer" && sessionTenantId === requestedTenantId;
}
