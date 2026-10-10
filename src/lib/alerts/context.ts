import { getPrismaClient } from "@/lib/prisma";
import { sumByDay } from "@/lib/snapshots";
import { readSelectionRatios, readSelectionWidgetSettings, readTenantDashboardModules } from "@/lib/tenant-settings";
import type { AlertContext } from "./rules";

const dayMs = 24 * 60 * 60 * 1000;

/** Loads what the alert rules need for one customer, whole database only (scope "all"). */
export async function loadAlertContext(tenantId: string, now: Date): Promise<AlertContext | null> {
  const prisma = getPrismaClient();
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      settings: true,
      copernica: { select: { lastSyncedAt: true } },
      rfmConfig: { select: { enabled: true, lastRunAt: true, lastRunStatus: true } },
      selections: {
        where: { enabled: true },
        select: {
          id: true,
          name: true,
          // Ten days covers the 7-day comparisons with a missed day or two.
          snapshots: { where: { scope: "all", measuredAt: { gte: new Date(now.getTime() - 10 * dayMs) } }, orderBy: { measuredAt: "desc" }, select: { measuredAt: true, profileCount: true } },
        },
      },
    },
  });
  if (!tenant) return null;

  const [campaigns, lastCampaign, rfmSnapshots] = await Promise.all([
    prisma.campaign.findMany({
      where: { tenantId, included: true, sentAt: { gte: new Date(now.getTime() - 90 * dayMs), lte: now } },
      select: { id: true, name: true, sentAt: true, sentCount: true, openCount: true, clickCount: true, bounceCount: true, unsubscribeCount: true, complaintCount: true },
    }),
    prisma.campaign.findFirst({ where: { tenantId, included: true, sentAt: { not: null, lte: now } }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
    tenant.rfmConfig?.enabled
      ? prisma.rfmSegmentSnapshot.findMany({ where: { tenantId, measuredAt: { gte: new Date(now.getTime() - 35 * dayMs) } }, select: { measuredAt: true, segment: true, customers: true } })
      : Promise.resolve([]),
  ]);

  const widgets = readSelectionWidgetSettings(tenant.settings);
  const label = (selection: { id: string; name: string }) => widgets.labels[selection.id] ?? selection.name;
  const byId = new Map(tenant.selections.map((selection) => [selection.id, selection]));
  const primary = widgets.primaryTotalId ? byId.get(widgets.primaryTotalId) : undefined;
  const excluded = new Set(widgets.excludedFromTotal);
  const counted = tenant.selections.filter((selection) => !excluded.has(selection.id));

  return {
    now,
    modules: readTenantDashboardModules(tenant.settings),
    selections: tenant.selections.map((selection) => ({ id: selection.id, name: label(selection), snapshots: selection.snapshots })),
    total: primary
      ? { name: label(primary), snapshots: primary.snapshots }
      : counted.length ? { name: "De database", snapshots: sumByDay(counted.map((selection) => selection.snapshots)) } : null,
    ratios: Object.entries(readSelectionRatios(tenant.settings)).flatMap(([partId, baseId]) => {
      const part = byId.get(partId);
      const base = byId.get(baseId);
      return part && base ? [{ id: part.id, name: label(part), baseName: label(base), part: part.snapshots, base: base.snapshots }] : [];
    }),
    campaigns,
    lastCampaignAt: lastCampaign?.sentAt ?? null,
    rfm: { enabled: Boolean(tenant.rfmConfig?.enabled), lastRunAt: tenant.rfmConfig?.lastRunAt ?? null, lastRunStatus: tenant.rfmConfig?.lastRunStatus ?? null, snapshots: rfmSnapshots },
    copernica: { connected: Boolean(tenant.copernica), lastSyncedAt: tenant.copernica?.lastSyncedAt ?? null },
  };
}
