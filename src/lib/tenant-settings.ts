import { getPrismaClient } from "./prisma";

export type TenantDashboardModules = {
  databaseStats: boolean;
  campaignStats: boolean;
};

const defaultModules: TenantDashboardModules = {
  databaseStats: true,
  campaignStats: true,
};

export async function getTenantDashboardModules(tenantId: string): Promise<TenantDashboardModules> {
  const tenant = await getPrismaClient().tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  return readTenantDashboardModules(tenant?.settings);
}

export function readTenantDashboardModules(value: unknown): TenantDashboardModules {
  const settings = asRecord(value);
  const savedModules = asRecord(settings.dashboardModules);

  return {
    databaseStats: typeof savedModules.databaseStats === "boolean" ? savedModules.databaseStats : defaultModules.databaseStats,
    campaignStats: typeof savedModules.campaignStats === "boolean" ? savedModules.campaignStats : defaultModules.campaignStats,
  };
}

export async function saveTenantDashboardModules(tenantId: string, modules: TenantDashboardModules) {
  const prisma = getPrismaClient();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  if (!tenant) throw new Error("Tenant not found.");

  const settings = asRecord(tenant.settings);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: { ...settings, dashboardModules: modules } },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
