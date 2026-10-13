import { getPrismaClient } from "./prisma";
import { normalizeSelectionGroups, type SelectionGroup } from "./selection-groups";

export { readSelectionGroups, type SelectionGroup } from "./selection-groups";

export type TenantDashboardModules = {
  databaseStats: boolean;
  campaignStats: boolean;
  /** "Inzicht": RFM segments, customer value, cohorts and development, in the customer's environment. */
  insight: boolean;
  /** "Voorspellen en advies": revenue and product forecast with advice, in the customer's environment. */
  forecast: boolean;
};

const defaultModules: TenantDashboardModules = {
  databaseStats: true,
  campaignStats: true,
  insight: false,
  forecast: false,
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
    insight: typeof savedModules.insight === "boolean" ? savedModules.insight : defaultModules.insight,
    forecast: typeof savedModules.forecast === "boolean" ? savedModules.forecast : defaultModules.forecast,
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
  primaryTotalId: string | null;
};

export function readSelectionWidgetSettings(value: unknown): SelectionWidgetSettings {
  const widgets = asRecord(asRecord(value).selectionWidgets);
  const strings = (input: unknown) => Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];
  return {
    order: strings(widgets.order),
    labels: Object.fromEntries(Object.entries(asRecord(widgets.labels)).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    excludedFromTotal: strings(widgets.excludedFromTotal),
    primaryTotalId: typeof widgets.primaryTotalId === "string" ? widgets.primaryTotalId : null,
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
  widget: { label: string; baseSelectionId: string | null; includeInTotal: boolean; isPrimaryTotal: boolean },
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
        selectionWidgets: {
          ...widgets,
          labels,
          excludedFromTotal: [...excluded],
          primaryTotalId: widget.isPrimaryTotal ? selectionId : widgets.primaryTotalId === selectionId ? null : widgets.primaryTotalId,
        },
      },
    },
  });
}

export async function saveSelectionGroups(tenantId: string, groups: SelectionGroup[]) {
  const prisma = getPrismaClient();
  const [tenant, owned] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
    prisma.copernicaSelection.findMany({ where: { tenantId }, select: { id: true } }),
  ]);
  if (!tenant) throw new Error("Tenant not found.");
  const settings = asRecord(tenant.settings);
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: { ...settings, selectionGroups: normalizeSelectionGroups(groups, new Set(owned.map((selection) => selection.id))) } },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/** Whether campaigns that arrive with a sync are shown straight away (default) or wait until the customer picks them. */
export function readCampaignAutoInclude(value: unknown) {
  const autoInclude = asRecord(asRecord(value).campaignSelection).autoInclude;
  return typeof autoInclude === "boolean" ? autoInclude : true;
}

export async function saveCampaignAutoInclude(tenantId: string, autoInclude: boolean) {
  const prisma = getPrismaClient();
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  if (!tenant) throw new Error("Tenant not found.");
  const settings = asRecord(tenant.settings);
  await prisma.tenant.update({ where: { id: tenantId }, data: { settings: { ...settings, campaignSelection: { ...asRecord(settings.campaignSelection), autoInclude } } } });
}
