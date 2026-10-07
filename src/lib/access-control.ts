export type Role = "admin" | "customer" | "anonymous";

export function canAccessTenant(
  role: Role,
  sessionTenantId: string | null,
  requestedTenantId: string,
): boolean {
  if (role === "admin") {
    return true;
  }

  if (role !== "customer") {
    return false;
  }

  return sessionTenantId === requestedTenantId;
}
