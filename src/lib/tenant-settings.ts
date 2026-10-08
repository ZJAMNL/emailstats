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

export type SelectionRatios = Record<string, string>;

export function readSelectionRatios(value: unknown): SelectionRatios {
  const ratios = asRecord(asRecord(value).selectionRatios);
  return Object.fromEntries(Object.entries(ratios).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export type SelectionWidgetSettings = {
  order: string[];
  labels: Record<string, string>;
  excludedFromTotal: string[];
};

export function readSelectionWidgetSettings(value: unknown): SelectionWidgetSettings {
  const widgets = asRecord(asRecord(value).selectionWidgets);
  const strings = (input: unknown) => Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];
  return {
    order: strings(widgets.order),
    labels: Object.fromEntries(Object.entries(asRecord(widgets.labels)).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    excludedFromTotal: strings(widgets.excludedFromTotal),
  };
}

export async function saveSelectionWidgetOrder(tenantId: string, order: string[]) {
  const prisma = getPrismaClient();
  const uniqueOrder = [...new Set(order)];
  const [tenant, owned] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
    prisma.copernicaSelection.count({ where: { tenantId, id: { in: uniqueOrder } } }),
  ]);
  if (!tenant) throw new Error("Tenant not found.");
  if (owned !== uniqueOrder.length) throw new Error("Invalid selection.");

  const settings = asRecord(tenant.settings);
  const widgets = readSelectionWidgetSettings(settings);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: { ...settings, selectionWidgets: { ...widgets, order: uniqueOrder } } },
  });
}

export async function saveSelectionWidget(
  tenantId: string,
  selectionId: string,
  widget: { label: string; baseSelectionId: string | null; includeInTotal: boolean },
) {
  const prisma = getPrismaClient();
  const ids = widget.baseSelectionId ? [selectionId, widget.baseSelectionId] : [selectionId];
  const [tenant, owned] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
    prisma.copernicaSelection.count({ where: { tenantId, id: { in: ids } } }),
  ]);
  if (!tenant) throw new Error("Tenant not found.");
  if (owned !== new Set(ids).size || selectionId === widget.baseSelectionId) throw new Error("Invalid selection.");

  const settings = asRecord(tenant.settings);
  const widgets = readSelectionWidgetSettings(settings);
  const labels = { ...widgets.labels };
  const label = widget.label.trim().slice(0, 80);
  if (label) labels[selectionId] = label;
  else delete labels[selectionId];
  const excluded = new Set(widgets.excludedFromTotal);
  if (widget.includeInTotal) excluded.delete(selectionId);
  else excluded.add(selectionId);
  const ratios = { ...readSelectionRatios(settings) };
  if (widget.baseSelectionId) ratios[selectionId] = widget.baseSelectionId;
  else delete ratios[selectionId];

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: {
        ...settings,
        selectionRatios: ratios,
        selectionWidgets: { ...widgets, labels, excludedFromTotal: [...excluded] },
      },
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
