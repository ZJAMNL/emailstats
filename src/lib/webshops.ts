import { cookies } from "next/headers";
import { getPrismaClient } from "./prisma";
import type { Session } from "./session";

export const ALL_SCOPE = "all";
export const SCOPE_COOKIE = "webshop-scope";

export type WebshopDefinition = { id: string; name: string; profileField: string; fieldValues: string[]; campaignTerms: string[] };
export type ScopeOption = { id: string; name: string; webshop: WebshopDefinition | null };

/**
 * Which scopes a user may see. Without webshops there is only the whole database. With webshops,
 * users with access to everything also get the combined "all" view; others only their own webshops.
 */
export function computeAllowedScopes(webshops: WebshopDefinition[], access: { allWebshops: boolean; webshopIds: string[] }): ScopeOption[] {
  if (!webshops.length) return [{ id: ALL_SCOPE, name: "Alle gegevens", webshop: null }];
  const own = webshops.filter((webshop) => access.allWebshops || access.webshopIds.includes(webshop.id)).map((webshop) => ({ id: webshop.id, name: webshop.name, webshop }));
  return access.allWebshops ? [{ id: ALL_SCOPE, name: "Alle webshops", webshop: null }, ...own] : own;
}

/** The requested scope when allowed, otherwise the first allowed one (null when nothing is allowed). */
export function resolveScope(allowed: ScopeOption[], requested: string | undefined | null) {
  return allowed.find((option) => option.id === requested) ?? allowed[0] ?? null;
}

export function campaignMatchesWebshop(campaign: { name: string }, webshop: WebshopDefinition | null) {
  if (!webshop) return true;
  const name = campaign.name.toLowerCase();
  return webshop.campaignTerms.some((term) => term.trim() && name.includes(term.trim().toLowerCase()));
}

export function filterCampaigns<T extends { name: string }>(campaigns: T[], webshop: WebshopDefinition | null) {
  return webshop ? campaigns.filter((campaign) => campaignMatchesWebshop(campaign, webshop)) : campaigns;
}

export function loadWebshops(tenantId: string): Promise<WebshopDefinition[]> {
  return getPrismaClient().webshop.findMany({
    where: { tenantId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, profileField: true, fieldValues: true, campaignTerms: true },
  });
}

/** Allowed scopes for the signed-in customer, read from the database on every request so admin changes apply at once. */
export async function getAllowedScopes(session: Session) {
  const webshops = await loadWebshops(session.tenantId);
  // An admin viewing as the customer sees everything.
  if (session.impersonator) return computeAllowedScopes(webshops, { allWebshops: true, webshopIds: [] });
  const user = await getPrismaClient().user.findFirst({
    where: { id: session.userId, tenantId: session.tenantId },
    select: { allWebshops: true, webshops: { select: { webshopId: true } } },
  });
  if (!user) return [];
  return computeAllowedScopes(webshops, { allWebshops: user.allWebshops, webshopIds: user.webshops.map((link) => link.webshopId) });
}

/** The scope the customer is looking at: the cookie's choice when allowed, else the first allowed scope. */
export async function getCustomerScope(session: Session) {
  if (!process.env.DATABASE_URL) return { allowed: [{ id: ALL_SCOPE, name: "Alle gegevens", webshop: null }], current: { id: ALL_SCOPE, name: "Alle gegevens", webshop: null } };
  const allowed = await getAllowedScopes(session);
  const cookieStore = await cookies();
  return { allowed, current: resolveScope(allowed, cookieStore.get(SCOPE_COOKIE)?.value) };
}

/** The scope an admin looks at on a client's pages, from the `webshop` query parameter. */
export async function getAdminScope(tenantId: string, requested: string | undefined) {
  const allowed = computeAllowedScopes(await loadWebshops(tenantId), { allWebshops: true, webshopIds: [] });
  return { allowed, current: resolveScope(allowed, requested)! };
}

/**
 * Tenant-wide settings (Copernica connection, followed selections, widget layout) affect every
 * webshop, so only users who may see everything can change them.
 */
export function canManageTenant(allowed: ScopeOption[]) {
  return allowed.some((option) => option.id === ALL_SCOPE);
}

export async function requireTenantManager(session: Session) {
  if (!process.env.DATABASE_URL) return true;
  return canManageTenant(await getAllowedScopes(session));
}
