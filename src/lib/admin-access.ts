import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { canAccessTenant } from "./access-control";
import { getPrismaClient } from "./prisma";
import { requireSession, type Session } from "./session";

export type AdminSession = Session & { role: "admin" | "superadmin" };

/**
 * The signed-in beheerder or superbeheerder. The role is read from the database on every request,
 * so a role change or a removed account applies at once instead of when the session expires.
 */
export const requireAdmin = cache(async (): Promise<AdminSession> => {
  const session = await requireSession();
  if (session.role === "customer") redirect("/dashboard/customer");
  // Without a database only the demo accounts exist; the demo beheerder sees everything.
  if (!process.env.DATABASE_URL) return { ...session, role: "superadmin" };

  const user = await getPrismaClient().user.findUnique({ where: { id: session.userId }, select: { role: true } });
  // The cookie still says beheerder, so /login would send it straight back; end the session first.
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPERADMIN")) redirect("/uitloggen");
  return { ...session, role: user.role === "SUPERADMIN" ? "superadmin" : "admin" };
});

export async function requireSuperAdmin() {
  const session = await requireAdmin();
  if (session.role !== "superadmin") redirect("/dashboard/admin");
  return session;
}

/** Prisma filter for the customers this beheerder may see. */
export function tenantWhere(session: AdminSession) {
  return session.role === "superadmin" ? {} : { ownerId: session.userId };
}

/** Whether the beheerder may see and change this customer. */
export async function adminCanAccessTenant(session: AdminSession, tenantId: string) {
  if (!tenantId) return false;
  if (!process.env.DATABASE_URL) return session.role === "superadmin";
  const tenant = await getPrismaClient().tenant.findUnique({ where: { id: tenantId }, select: { id: true, ownerId: true } });
  return tenant !== null && canAccessTenant({ role: session.role, userId: session.userId, tenantId: null }, tenant);
}

/** For pages: the beheerder, or a 404 when the customer is not theirs (so other customers' ids stay hidden). */
export async function requireTenantAdmin(tenantId: string) {
  const session = await requireAdmin();
  if (!(await adminCanAccessTenant(session, tenantId))) notFound();
  return session;
}

/** For server actions: the beheerder, or null when the customer is not theirs. */
export async function adminForTenant(tenantId: string) {
  const session = await requireAdmin();
  return (await adminCanAccessTenant(session, String(tenantId ?? ""))) ? session : null;
}
