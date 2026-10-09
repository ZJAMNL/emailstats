export type Role = "superadmin" | "admin" | "customer" | "anonymous";

/**
 * Superbeheerders see every customer, beheerders only the customers they own, and customers
 * only their own environment.
 */
export function canAccessTenant(
  viewer: { role: Role; userId: string | null; tenantId: string | null },
  tenant: { id: string; ownerId: string | null },
): boolean {
  if (viewer.role === "superadmin") return true;
  if (viewer.role === "admin") return viewer.userId !== null && tenant.ownerId === viewer.userId;
  if (viewer.role === "customer") return viewer.tenantId === tenant.id;
  return false;
}
