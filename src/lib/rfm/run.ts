import { getTenantCopernica } from "../copernica";
import { getPrismaClient } from "../prisma";
import { countDatabaseProfiles, fetchAllOrders } from "./copernica-orders";
import { scoreRfm, type RfmDataQuality } from "./score";
import { fmScore, type RfmSegmentKey } from "./segments";
import { summarizeRfm, type RfmValueSummary } from "./value";

export type RfmModelSettings = {
  collectionId: string;
  dateField: string;
  amountField: string;
  statusField: string | null;
  excludedStatuses: string[];
  windowMonths: number;
  frequencyThresholds: number[];
  marginPercent: number;
};

export type RfmRunSummary = {
  ranAt: string;
  durationMs: number;
  ordersFetched: number;
  totalProfiles: number;
  quality: RfmDataQuality;
  value: RfmValueSummary;
  /** Customer counts on the R × FM grid: grid[r - 1][fm - 1]. */
  grid: number[][];
  settings: RfmModelSettings;
};

/** Fetches orders from Copernica and scores them. Nothing is stored. */
export async function calculateRfm(tenantId: string, settings: RfmModelSettings) {
  const started = Date.now();
  const connected = await getTenantCopernica(tenantId);
  if (!connected) throw new Error("Deze klant heeft nog geen Copernica-koppeling.");

  const [fetched, totalProfiles] = await Promise.all([
    fetchAllOrders(connected.jwt, settings.collectionId, settings),
    countDatabaseProfiles(connected.jwt, connected.connection.databaseId),
  ]);
  const now = new Date();
  const { customers, quality } = scoreRfm(fetched.orders, { now, windowMonths: settings.windowMonths, frequencyThresholds: settings.frequencyThresholds, excludedStatuses: settings.excludedStatuses });
  const value = summarizeRfm(customers, { prospects: Math.max(0, totalProfiles - customers.length), windowMonths: settings.windowMonths, marginPercent: settings.marginPercent });
  const grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0));
  for (const customer of customers) grid[customer.r - 1][fmScore(customer.f, customer.m) - 1]++;

  const summary: RfmRunSummary = { ranAt: now.toISOString(), durationMs: Date.now() - started, ordersFetched: fetched.orders.length, totalProfiles, quality, value, grid, settings };
  return { customers, summary };
}

/** Calculates RFM with the saved configuration and stores scores, a daily snapshot and the run summary. */
export async function runRfm(tenantId: string) {
  const prisma = getPrismaClient();
  const config = await prisma.rfmConfig.findUnique({ where: { tenantId } });
  if (!config) throw new Error("Er is nog geen RFM-model ingesteld.");

  try {
    const { customers, summary } = await calculateRfm(tenantId, settingsFromConfig(config));
    const now = new Date(summary.ranAt);
    const newMonth = !config.lastRunAt || config.lastRunAt.getUTCFullYear() !== now.getUTCFullYear() || config.lastRunAt.getUTCMonth() !== now.getUTCMonth();
    const existing = await prisma.rfmProfileScore.findMany({ where: { tenantId }, select: { copernicaProfileId: true, segment: true, previousSegment: true, monthStartSegment: true } });
    const existingById = new Map(existing.map((row) => [row.copernicaProfileId, row]));

    const rows = customers.map((customer) => {
      const before = existingById.get(customer.profileId);
      return {
        tenantId,
        copernicaProfileId: customer.profileId,
        lastOrderAt: customer.lastOrderAt,
        orderCount: customer.orderCount,
        revenue: customer.revenue,
        r: customer.r,
        f: customer.f,
        m: customer.m,
        segment: customer.segment,
        // Keep the last *different* segment, like Klaviyo's "previous RFM group".
        previousSegment: before ? (before.segment !== customer.segment ? before.segment : before.previousSegment) : null,
        // The segment at the first run of the month is the baseline for the migration matrix.
        monthStartSegment: newMonth ? (before?.segment ?? null) : (before?.monthStartSegment ?? null),
      };
    });

    const measuredAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await prisma.$transaction(async (transaction) => {
      await transaction.rfmProfileScore.deleteMany({ where: { tenantId } });
      for (let index = 0; index < rows.length; index += 5000) {
        await transaction.rfmProfileScore.createMany({ data: rows.slice(index, index + 5000) });
      }
      await transaction.rfmSegmentSnapshot.deleteMany({ where: { tenantId, measuredAt } });
      await transaction.rfmSegmentSnapshot.createMany({
        data: summary.value.segments.map((segment) => ({ tenantId, measuredAt, segment: segment.key, customers: segment.customers, orders: segment.orders, revenue: segment.revenue })),
      });
      await transaction.rfmConfig.update({ where: { tenantId }, data: { lastRunAt: now, lastRunStatus: "ok", lastRunSummary: summary } });
    }, { timeout: 120_000, maxWait: 20_000 });

    return summary;
  } catch (error) {
    await prisma.rfmConfig.update({ where: { tenantId }, data: { lastRunAt: new Date(), lastRunStatus: error instanceof Error ? error.message.slice(0, 300) : "Onbekende fout" } });
    throw error;
  }
}

export function settingsFromConfig(config: { collectionId: string; dateField: string; amountField: string; statusField: string | null; excludedStatuses: string[]; windowMonths: number; frequencyThresholds: number[]; marginPercent: number }): RfmModelSettings {
  return {
    collectionId: config.collectionId,
    dateField: config.dateField,
    amountField: config.amountField,
    statusField: config.statusField,
    excludedStatuses: config.excludedStatuses,
    windowMonths: config.windowMonths,
    frequencyThresholds: config.frequencyThresholds,
    marginPercent: config.marginPercent,
  };
}

export async function loadMigrationMatrix(tenantId: string) {
  const groups = await getPrismaClient().rfmProfileScore.groupBy({
    by: ["monthStartSegment", "segment"],
    where: { tenantId, monthStartSegment: { not: null } },
    _count: { _all: true },
  });
  return groups.map((group) => ({ from: group.monthStartSegment as RfmSegmentKey, to: group.segment as RfmSegmentKey, count: group._count._all }));
}
